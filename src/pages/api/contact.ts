export const prerender = false;

import type { APIRoute } from "astro";
import nodemailer from "nodemailer";

const MERCI_PATH = "/contact/merci";

const MAX_LEN = { name: 200, email: 254, message: 10_000 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function textResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function redirectMerci(request: Request) {
  const url = new URL(MERCI_PATH, request.url);
  return Response.redirect(url.toString(), 303);
}

/** Évite l’injection d’en-têtes dans le sujet expéditeur. */
function headerSafe(s: string, max: number) {
  return s.replace(/[\r\n]/g, " ").slice(0, max);
}

export const POST: APIRoute = async ({ request }) => {
  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return textResponse("Requête invalide.", 400);
  }

  const company = String(data.get("company") ?? "").trim();
  if (company !== "") {
    return redirectMerci(request);
  }

  const name = String(data.get("name") ?? "").trim();
  const email = String(data.get("email") ?? "").trim();
  const message = String(data.get("message") ?? "").trim();

  if (!name || !email || !message) {
    return textResponse(
      "Tous les champs obligatoires doivent être renseignés.",
      400,
    );
  }
  if (
    name.length > MAX_LEN.name ||
    email.length > MAX_LEN.email ||
    message.length > MAX_LEN.message
  ) {
    return textResponse("Un ou plusieurs champs sont trop longs.", 400);
  }
  if (!EMAIL_RE.test(email)) {
    return textResponse("Adresse e-mail invalide.", 400);
  }

  const host = import.meta.env.SMTP_HOST as string | undefined;
  const user = import.meta.env.SMTP_USER as string | undefined;
  const pass = import.meta.env.SMTP_PASS as string | undefined;
  const contactTo = import.meta.env.CONTACT_TO as string | undefined;
  const contactFrom = import.meta.env.CONTACT_FROM as string | undefined;
  const portStr = import.meta.env.SMTP_PORT as string | undefined;

  if (!host || !user || !pass || !contactTo || !contactFrom) {
    console.error("contact: variables SMTP ou CONTACT_* manquantes");
    return textResponse("Le service est momentanément indisponible.", 500);
  }

  const port = Number(portStr ?? 587);
  const secure =
    import.meta.env.SMTP_SECURE === "true" || port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: contactFrom,
      to: contactTo,
      replyTo: email,
      subject: `[wsconseil.com] Message de ${headerSafe(name, 120)}`,
      text: `Nom: ${name}\nEmail: ${email}\n\n${message}`,
    });
  } catch (e) {
    console.error("contact: sendMail", e);
    return textResponse(
      "L’envoi du message a échoué. Réessayez plus tard.",
      500,
    );
  }

  return redirectMerci(request);
};
