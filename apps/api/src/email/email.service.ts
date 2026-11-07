import { Injectable, Logger } from '@nestjs/common'
import * as nodemailer from 'nodemailer'
import { render } from 'react-email'
import { env } from '#/config/env'
import { ResetPasswordEmail } from './templates/reset-password'
import { VerifyEmail } from './templates/verify-email'

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)

  /**
   * `null` when SMTP is not configured (production without `SMTP_HOST`): emails
   * are then skipped instead of failing the request that triggers them (e.g.
   * the owner's sign-up), and the health check leaves SMTP out.
   */
  private readonly transporter = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
      })
    : null

  /** Whether SMTP is configured, i.e. emails are actually sent. */
  get enabled(): boolean {
    return this.transporter !== null
  }

  /**
   * Verify the SMTP connection/credentials without sending mail. Used by the
   * health check to surface a broken mail pipeline.
   */
  async verifyConnection(): Promise<void> {
    if (!this.transporter) throw new Error('SMTP is not configured')
    await this.transporter.verify()
  }

  async sendEmailVerification(to: string, verifyUrl: string): Promise<void> {
    if (!this.transporter) return this.skip('verification')
    const html = await render(VerifyEmail({ verifyUrl }))
    await this.transporter.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject: 'Vérifiez votre adresse email',
      html,
    })
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    if (!this.transporter) return this.skip('password reset')
    const html = await render(ResetPasswordEmail({ resetUrl }))
    await this.transporter.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject: 'Réinitialisation de votre mot de passe',
      html,
    })
  }

  /** Never logs the recipient or the link (it carries a token). */
  private skip(kind: string): void {
    this.logger.warn(
      `SMTP is not configured (SMTP_HOST): ${kind} email not sent`,
    )
  }
}
