import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AuthFormMessage from './AuthFormMessage';
import PasswordInput from './PasswordInput';
import TextInput from './TextInput';

describe('authentication accessibility primitives', () => {
  it('associates helper text with its text input', () => {
    render(
      <TextInput
        id="email"
        label="Email"
        value=""
        onChange={() => {}}
        hint="Use your school email"
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Email' });
    const hint = screen.getByText('Use your school email');
    expect(input).toHaveAttribute('aria-describedby', hint.id);
  });

  it('marks an invalid password and connects its error message', () => {
    render(
      <PasswordInput
        id="password"
        label="Password"
        value=""
        onChange={() => {}}
        error="Password is required"
      />,
    );

    const input = screen.getByLabelText('Password');
    const error = screen.getByRole('alert');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', error.id);
  });

  it('announces error and success messages with appropriate live regions', () => {
    const { rerender } = render(<AuthFormMessage type="error" message="Unable to sign in" />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');

    rerender(<AuthFormMessage type="success" message="Email verified" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});
