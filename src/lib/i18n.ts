"use client";

import { useCallback, useEffect, useState } from "react";

export type Lang = "en" | "es";

const STRINGS = {
  en: {
    newChat: "New chat",
    today: "Today",
    week: "Previous 7 days",
    older: "Older",
    noChats: "Your conversations will appear here.",
    rename: "Rename",
    delete: "Delete",
    confirmDelete: "Delete this chat?",
    yes: "Yes, delete",
    cancel: "Cancel",
    signOut: "Sign out",
    placeholder: "Message Sami…",
    samiGuide: "Your SPC Guide",
    samiThinking: "Sami is thinking",
    send: "Send",
    stop: "Stop",
    disclaimer: "Sami is an AI companion and can make mistakes. For diagnoses or emergencies, contact a professional.",
    greetingTitle: "Hello, I am Sami",
    greeting:
      "Your Secure Parent companion 24/7. Ask me anything and I will give you my suggestions based on the skills we develop in SPC: emotional regulation, mindsight and positive discipline, so you can grow as a secure parent on demand.",
    starters: [
      "What is the S.A.F.E. practice and how do I use it?",
      "My child has meltdowns. How can I respond?",
      "I keep yelling even though I know better. Can you help?",
      "Which lesson should I watch for my situation?",
      "How do I join the WhatsApp group?",
      "How can I contact customer support?",
    ],
    errGeneric: "I couldn't answer just now. Please try again in a moment.",
    errLimit: "You reached today's message limit. Sami will be available again tomorrow.",
    errMember: "This account doesn't have access to Sami yet. Use the email of your Secure Parent Collective membership or contact the HIC team.",
    retry: "Try again",
    menu: "Menu",
    loading: "Loading…",
    // auth
    welcome: "Sign in to chat with Sami",
    welcomeSub: "Your Secure Parent companion, inside the Secure Parent Collective.",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signUp: "Create account",
    forgot: "Forgot your password?",
    haveAccount: "Already have an account? Sign in",
    noAccount: "New here? Create an account",
    sendReset: "Send reset link",
    backToSignIn: "Back to sign in",
    checkEmail: "Check your email to confirm your account, then sign in.",
    resetSent: "If that email has an account, we sent a link to reset the password.",
    newPassword: "New password",
    savePassword: "Save password",
    passwordSaved: "Password updated. Taking you to Sami…",
    useMemberEmail: "Use the same email as your SPC membership.",
    minPassword: "At least 8 characters.",
  },
  es: {
    newChat: "Nuevo chat",
    today: "Hoy",
    week: "Últimos 7 días",
    older: "Anteriores",
    noChats: "Aquí aparecerán tus conversaciones.",
    rename: "Renombrar",
    delete: "Eliminar",
    confirmDelete: "¿Eliminar este chat?",
    yes: "Sí, eliminar",
    cancel: "Cancelar",
    signOut: "Cerrar sesión",
    placeholder: "Escríbele a Sami…",
    samiGuide: "Tu guía del SPC",
    samiThinking: "Sami está pensando",
    send: "Enviar",
    stop: "Detener",
    disclaimer: "Sami es una compañera con IA y puede equivocarse. Para diagnósticos o emergencias, contacta a un profesional.",
    greetingTitle: "Hola, soy Sami",
    greeting:
      "Tu compañera Secure Parent 24/7. Pregúntame lo que quieras y te daré mis sugerencias basadas en las habilidades que desarrollamos en el SPC: regulación emocional, mindsight y disciplina positiva, para que crezcas como padre o madre segura cuando lo necesites.",
    starters: [
      "¿Qué es la práctica S.A.F.E. y cómo la uso?",
      "Mi hijo tiene rabietas fuertes. ¿Cómo respondo?",
      "Sigo gritando aunque sé que no debería. ¿Me ayudas?",
      "¿Qué lección debería ver para mi situación?",
      "¿Cómo entro al grupo de WhatsApp?",
      "¿Cómo contacto a servicio al cliente?",
    ],
    errGeneric: "No pude responder en este momento. Intenta de nuevo en un momento.",
    errLimit: "Llegaste al límite de mensajes de hoy. Sami estará disponible de nuevo mañana.",
    errMember: "Esta cuenta todavía no tiene acceso a Sami. Usa el email de tu membresía del Secure Parent Collective o contacta al equipo de HIC.",
    retry: "Intentar de nuevo",
    menu: "Menú",
    loading: "Cargando…",
    welcome: "Entra a hablar con Sami",
    welcomeSub: "Tu compañera Secure Parent, dentro del Secure Parent Collective.",
    email: "Email",
    password: "Contraseña",
    signIn: "Iniciar sesión",
    signUp: "Crear cuenta",
    forgot: "¿Olvidaste tu contraseña?",
    haveAccount: "¿Ya tienes cuenta? Inicia sesión",
    noAccount: "¿Eres nueva? Crea una cuenta",
    sendReset: "Enviar enlace",
    backToSignIn: "Volver a iniciar sesión",
    checkEmail: "Revisa tu email para confirmar tu cuenta y luego inicia sesión.",
    resetSent: "Si ese email tiene cuenta, te enviamos un enlace para cambiar la contraseña.",
    newPassword: "Nueva contraseña",
    savePassword: "Guardar contraseña",
    passwordSaved: "Contraseña actualizada. Te llevamos a Sami…",
    useMemberEmail: "Usa el mismo email de tu membresía del SPC.",
    minPassword: "Mínimo 8 caracteres.",
  },
};

export type Strings = (typeof STRINGS)["en"];

export function useLang() {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("sami_lang");
    } catch {}
    const initial: Lang =
      saved === "es" || saved === "en" ? saved : navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
    setLangState(initial);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("sami_lang", l);
    } catch {}
  }, []);

  return { lang, setLang, t: STRINGS[lang] as Strings };
}
