import nodemailer from 'nodemailer'
import type { Env } from '../config/env.js'

export async function sendMail(env: Env, message: { to: string; subject: string; text: string }) {
  if (!env.SMTP_HOST || env.NODE_ENV === 'test') {
    if (env.NODE_ENV === 'development') {
      console.log(`Mail skipped\nTo: ${message.to}\n${message.subject}\n${message.text}`)
    }
    return
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  })
  await transport.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to: message.to,
    subject: message.subject,
    text: message.text,
  })
}
