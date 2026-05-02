-- ============================================================
-- Migration：登入鎖定 + 留言刪除
-- 請在 Supabase > SQL Editor 執行此檔案
-- ============================================================

-- ── 1. profiles 新增 is_locked 欄位（管理員頁顯示用）──────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. 建立登入失敗追蹤資料表 ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.login_attempts (
  username  TEXT    PRIMARY KEY,
  attempts  INT     NOT NULL DEFAULT 0,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- 匿名使用者可讀取（登入前檢查是否鎖定）
DROP POLICY IF EXISTS "anon_select" ON public.login_attempts;
CREATE POLICY "anon_select" ON public.login_attempts
  FOR SELECT USING (true);

-- ── 3. RPC：記錄登入失敗（anon 可呼叫）─────────────────────────
CREATE OR REPLACE FUNCTION public.record_login_failure(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts INT;
  v_locked   BOOLEAN;
  v_user_id  UUID;
BEGIN
  -- 原子性 UPSERT：累加失敗次數，達 5 次自動鎖定
  INSERT INTO public.login_attempts (username, attempts, is_locked)
  VALUES (p_username, 1, FALSE)
  ON CONFLICT (username) DO UPDATE
    SET
      attempts  = public.login_attempts.attempts + 1,
      is_locked = CASE
                    WHEN public.login_attempts.attempts + 1 >= 5 THEN TRUE
                    ELSE public.login_attempts.is_locked
                  END
  RETURNING attempts, is_locked INTO v_attempts, v_locked;

  -- 若剛達到鎖定條件，同步更新 profiles.is_locked
  IF v_locked THEN
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = p_username
       OR email = p_username || '@intranet.app'
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
      UPDATE public.profiles SET is_locked = TRUE WHERE id = v_user_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('attempts', v_attempts, 'is_locked', v_locked);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_login_failure(TEXT) TO anon, authenticated;

-- ── 4. RPC：登入成功時清除失敗記錄（authenticated 可呼叫）────────
CREATE OR REPLACE FUNCTION public.record_login_success(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_username TEXT;
BEGIN
  UPDATE public.profiles SET is_locked = FALSE WHERE id = p_user_id;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NOT NULL THEN
    v_username := replace(v_email, '@intranet.app', '');
    DELETE FROM public.login_attempts
    WHERE username = v_username OR username = v_email;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_login_success(UUID) TO authenticated;

-- ── 5. RPC：管理員解除鎖定（authenticated 可呼叫）──────────────
CREATE OR REPLACE FUNCTION public.unlock_account(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_username TEXT;
BEGIN
  UPDATE public.profiles SET is_locked = FALSE WHERE id = target_user_id;

  SELECT email INTO v_email FROM auth.users WHERE id = target_user_id;
  IF v_email IS NOT NULL THEN
    v_username := replace(v_email, '@intranet.app', '');
    DELETE FROM public.login_attempts
    WHERE username = v_username OR username = v_email;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_account(UUID) TO authenticated;

-- ── 6. messages 刪除 RLS 政策 ────────────────────────────────
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can delete own messages" ON public.messages;
CREATE POLICY "users can delete own messages"
  ON public.messages FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins can delete any message" ON public.messages;
CREATE POLICY "admins can delete any message"
  ON public.messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND level >= 3
    )
  );
