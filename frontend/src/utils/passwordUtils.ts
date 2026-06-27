/**
 * Shared password validation utilities.
 *
 * Rules (must match auth/RegisterPage.tsx and auth/ResetPasswordPage.tsx):
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character
 */

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function passwordStrengthMessage(password: string): string {
  if (password.length < 8) return 'Mật khẩu cần có ít nhất 8 ký tự.';
  if (!/[A-Z]/.test(password)) return 'Mật khẩu cần có ít nhất 1 chữ hoa.';
  if (!/[a-z]/.test(password)) return 'Mật khẩu cần có ít nhất 1 chữ thường.';
  if (!/[0-9]/.test(password)) return 'Mật khẩu cần có ít nhất 1 chữ số.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Mật khẩu cần có ít nhất 1 ký tự đặc biệt.';
  return '';
}
