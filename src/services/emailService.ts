import nodemailer from "nodemailer";
import { logger } from "../utils/logger";

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

/**
 * Generic Email Service for sending emails
 */
export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;

  /**
   * Initialize email transporter
   */
  private static initializeTransporter(): nodemailer.Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const port = parseInt(process.env.SMTP_PORT || "587");
    // Port 465 uses SSL (secure: true), port 587 uses STARTTLS (secure: false)
    const secure = port === 465 ? true : false;

    const config: EmailConfig = {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: port,
      secure: secure, // true for 465, false for 587 and others
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASSWORD || "",
      },
    };

    this.transporter = nodemailer.createTransport(config);

    // Verify transporter configuration
    this.transporter.verify((error: Error | null) => {
      if (error) {
        logger.error("Email transporter verification failed:", error);
      } else {
        logger.info("Email service is ready to send emails");
      }
    });

    return this.transporter;
  }

  /**
   * Send email
   * @param options Email options (to, subject, text, html, from)
   * @returns Promise with result
   */
  static async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const transporter = this.initializeTransporter();

      const mailOptions = {
        from: options.from || process.env.SMTP_FROM || process.env.SMTP_USER,
        to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const info = await transporter.sendMail(mailOptions);

      logger.info(`Email sent successfully: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error("Error sending email:", error);
      throw new Error("Failed to send email");
    }
  }

  /**
   * Send password reset email
   * @param email User email
   * @param resetToken Reset token
   * @param userName User's name
   * @returns Promise with result
   */
  static async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    userName: string
  ): Promise<boolean> {
    const resetUrl = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/reset-password?token=${resetToken}`;
    const expiryTime = process.env.RESET_TOKEN_EXPIRY || "1 hour";

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .button { display: inline-block; padding: 12px 30px; background-color: #4F46E5; color: white !important; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
            .warning { background-color: #FEF3C7; padding: 15px; border-left: 4px solid #F59E0B; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hello ${userName},</p>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button" style="color: white !important; background-color: #4F46E5; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #4F46E5;">${resetUrl}</p>
              <div class="warning">
                <strong>⚠️ Important:</strong>
                <ul>
                  <li>This link will expire in ${expiryTime}</li>
                  <li>If you didn't request this, please ignore this email</li>
                  <li>Your password will remain unchanged until you create a new one</li>
                </ul>
              </div>
              <p>For security reasons, please do not share this link with anyone.</p>
            </div>
            <div class="footer">
              <p>If you're having trouble clicking the button, copy and paste the URL above into your web browser.</p>
              <p>&copy; ${new Date().getFullYear()} Social Platform. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      Password Reset Request

      Hello ${userName},

      We received a request to reset your password. Click the link below to create a new password:
      ${resetUrl}

      This link will expire in ${expiryTime}.

      If you didn't request this, please ignore this email. Your password will remain unchanged.

      For security reasons, please do not share this link with anyone.
    `;

    return this.sendEmail({
      to: email,
      subject: "Password Reset Request - Social Platform",
      text,
      html,
    });
  }

  /**
   * Send password reset confirmation email
   * @param email User email
   * @param userName User's name
   * @returns Promise with result
   */
  static async sendPasswordResetConfirmation(
    email: string,
    userName: string
  ): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
            .alert { background-color: #FEE2E2; padding: 15px; border-left: 4px solid #EF4444; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✓ Password Reset Successful</h1>
            </div>
            <div class="content">
              <p>Hello ${userName},</p>
              <p>This is a confirmation that your password has been successfully reset.</p>
              <div class="alert">
                <strong>⚠️ Security Alert:</strong>
                <p>If you did not make this change, please contact our support team immediately and secure your account.</p>
              </div>
              <p>You can now log in with your new password.</p>
              <p>Thank you for using our platform!</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Social Platform. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      Password Reset Successful

      Hello ${userName},

      This is a confirmation that your password has been successfully reset.

      If you did not make this change, please contact our support team immediately.

      You can now log in with your new password.
    `;

    return this.sendEmail({
      to: email,
      subject: "Password Reset Successful - Social Platform",
      text,
      html,
    });
  }

  /**
   * Send welcome email
   * @param email User email
   * @param userName User's name
   * @returns Promise with result
   */
  static async sendWelcomeEmail(
    email: string,
    userName: string
  ): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Social Platform!</h1>
            </div>
            <div class="content">
              <p>Hello ${userName},</p>
              <p>Welcome to our community! We're excited to have you on board.</p>
              <p>Get started by completing your profile and connecting with friends.</p>
              <p>If you have any questions, feel free to reach out to our support team.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Social Platform. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      Welcome to Social Platform!

      Hello ${userName},

      Welcome to our community! We're excited to have you on board.

      Get started by completing your profile and connecting with friends.
    `;

    return this.sendEmail({
      to: email,
      subject: "Welcome to Social Platform!",
      text,
      html,
    });
  }
}
