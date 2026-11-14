import { z } from 'zod'

const emailField = z.email('Email invalide')

/** Same rules as the API (`NewPasswordField`). */
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_BYTES = 72

/**
 * A password being set (sign-up, reset, change): at least 12 characters, and
 * at most 72 bytes since bcrypt ignores the rest (accents take 2 bytes).
 */
export const newPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Au moins ${PASSWORD_MIN_LENGTH} caractères`)
  .refine(
    (value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES,
    'Trop long : 72 octets au plus (un accent en compte 2)',
  )

/** A password typed to sign in: older ones may be shorter than 12. */
const currentPasswordField = z.string().min(1, 'Mot de passe requis')

export const loginSchema = z.object({
  email: emailField,
  password: currentPasswordField,
})

export const registerSchema = z
  .object({
    email: emailField,
    name: z.string().min(1, 'Nom requis'),
    password: newPasswordField,
    confirmPassword: z.string().min(1, 'Confirmez le mot de passe'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

export const forgotSchema = z.object({
  email: emailField,
})

export const changePasswordSchema = z
  .object({
    currentPassword: currentPasswordField,
    newPassword: newPasswordField,
    confirm: z.string().min(1, 'Confirmez le mot de passe'),
    revokeAccessTokens: z.boolean(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm'],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'Choisissez un mot de passe différent de l’actuel',
    path: ['newPassword'],
  })

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
export type ForgotValues = z.infer<typeof forgotSchema>
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
