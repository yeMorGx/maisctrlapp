import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import {
  ArrowLeftIcon,
  BarChartIcon,
  BellIcon,
  CardStackIcon,
  CalendarIcon,
  CheckCircledIcon,
  ChevronRightIcon,
  DotsHorizontalIcon,
  EnvelopeClosedIcon,
  EyeClosedIcon,
  EyeOpenIcon,
  LockClosedIcon,
  PersonIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import {
  FlowStack,
  BottomSheet,
  KeyboardInput,
  MobileScroll,
  type FlowControls,
  type FlowScreen,
  useMobileDevice,
  useKeyboard,
} from "./mobile";
import { supabase, supabaseConfigured } from "./lib/supabase";

const backgroundAsset = "/assets/auth-panels.png";
const logoAsset = "/assets/logo.svg";

function authErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.toLowerCase().includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (message.toLowerCase().includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (message.toLowerCase().includes("user already registered")) return "Este e-mail já possui uma conta.";
  if (message.toLowerCase().includes("password should be at least")) return "A senha precisa ter pelo menos 8 caracteres.";
  return message || "Não foi possível concluir agora. Tente novamente.";
}

function useInitialAuthState() {
  const [ready, setReady] = useState(!supabaseConfigured);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.warn("Não foi possível restaurar a sessão mobile.", error);
      setHasSession(Boolean(data.session));
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  return { ready, hasSession };
}

function BrandLockup() {
  return (
    <div className="brand-lockup" aria-label="MaisCtrl">
      <img src={logoAsset} alt="" className="brand-mark" draggable={false} />
      <span>MaisCtrl</span>
    </div>
  );
}

function AuthBackground() {
  return (
    <div className="auth-background" aria-hidden="true">
      <img src={backgroundAsset} alt="" draggable={false} />
      <div className="auth-background-shade" />
    </div>
  );
}

function BackButton({ flow, onBack }: { flow: FlowControls; onBack?: () => void }) {
  return (
    <button
      className="icon-button auth-back-button"
      type="button"
      aria-label="Voltar"
      onClick={(event) => {
        event.currentTarget.blur();
        if (onBack) {
          onBack();
          return;
        }
        flow.pop();
      }}
    >
      <ArrowLeftIcon aria-hidden="true" />
    </button>
  );
}

function Field({
  id,
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  icon,
}: {
  id: string;
  label: string;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  icon: "mail" | "lock";
}) {
  return (
    <label className="mobile-field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="input-shell">
        {icon === "mail" ? <EnvelopeClosedIcon aria-hidden="true" /> : <LockClosedIcon aria-hidden="true" />}
        <KeyboardInput
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="mobile-field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="input-shell">
        <LockClosedIcon aria-hidden="true" />
        <KeyboardInput
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          placeholder="Sua senha"
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="input-action"
          type="button"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeClosedIcon aria-hidden="true" /> : <EyeOpenIcon aria-hidden="true" />}
        </button>
      </span>
    </label>
  );
}

function SplashScreen({ flow }: { flow: FlowControls }) {
  const hasAdvanced = useRef(false);

  useEffect(() => {
    if (hasAdvanced.current) return;

    const timer = window.setTimeout(() => {
      if (hasAdvanced.current) return;
      hasAdvanced.current = true;
      flow.push(welcomeScreen());
    }, 950);
    return () => window.clearTimeout(timer);
  }, [flow, hasAdvanced]);

  return (
    <div className="splash-screen" data-testid="splash-screen" aria-label="MaisCtrl">
      <motion.img
        src={logoAsset}
        alt="MaisCtrl"
        className="splash-logo"
        draggable={false}
        initial={{ opacity: 0, scale: 0.78 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

function WelcomeScreen({ flow }: { flow: FlowControls }) {
  return (
    <div className="auth-screen" data-testid="welcome-screen">
      <AuthBackground />
      <div className="auth-topbar">
        <BrandLockup />
      </div>
      <motion.div
        className="auth-brand-hero"
        aria-hidden="true"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2>Você no controle.</h2>
        <img src={logoAsset} alt="" className="auth-hero-mark" draggable={false} />
      </motion.div>

      <MobileScroll className="auth-scroll">
        <AuthScrollContent className="auth-scroll-content auth-scroll-content-welcome">
          <motion.section
            className="auth-panel auth-panel-welcome"
            initial={{ y: 44, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="panel-heading">
              <span className="panel-kicker">Seu dinheiro, com mais clareza</span>
              <h1>Já nos conhecemos?</h1>
              <p>Entre para continuar de onde parou.</p>
            </div>
            <div className="button-stack">
              <button className="pill-button" type="button" onClick={(event) => pushScreen(event, flow, loginScreen())}>
                Sim! Quero entrar.
              </button>
              <button className="pill-button pill-button-muted" type="button" onClick={(event) => pushScreen(event, flow, signupScreen())}>
                Ainda não!
              </button>
            </div>
          </motion.section>
        </AuthScrollContent>
      </MobileScroll>
    </div>
  );
}

function AuthTopbar({ flow, onBack, showBrand = true }: { flow: FlowControls; onBack?: () => void; showBrand?: boolean }) {
  return (
    <div className="auth-topbar auth-topbar-form">
      <BackButton flow={flow} onBack={onBack} />
      {showBrand ? <BrandLockup /> : <span className="topbar-spacer" aria-hidden="true" />}
      <span className="topbar-spacer" aria-hidden="true" />
    </div>
  );
}

function AuthScrollContent({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const { device } = useMobileDevice();

  return (
    <main className={className} style={{ minHeight: device.geometry.screen.height }}>
      {children}
    </main>
  );
}

function pushScreen(event: MouseEvent<HTMLButtonElement>, flow: FlowControls, screen: FlowScreen) {
  event.currentTarget.blur();
  flow.push(screen);
}

function AuthSuccess({
  message,
  onReset,
  onContinue,
  continueLabel = "Continuar",
}: {
  message: string;
  onReset: () => void;
  onContinue?: () => void;
  continueLabel?: string;
}) {
  return (
    <motion.div className="auth-success" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} role="status">
      <CheckCircledIcon aria-hidden="true" />
      <div>
        <strong>Tudo certo.</strong>
        <span>{message}</span>
      </div>
      <button type="button" onClick={onContinue ?? onReset}>
        {onContinue ? continueLabel : "Voltar"}
      </button>
      {onContinue && (
        <button className="auth-success-secondary" type="button" onClick={onReset}>
          Editar dados
        </button>
      )}
    </motion.div>
  );
}

function LoginScreen({ flow }: { flow: FlowControls }) {
  const keyboard = useKeyboard();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    keyboard.hide();
    setAuthError("");

    if (!supabase) {
      setAuthError("A conexão com o Supabase ainda não foi configurada.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setAuthError(authErrorMessage(error));
      setIsSubmitting(false);
      return;
    }

    flow.replace(dashboardScreen());
  };

  return (
    <div className="auth-screen" data-testid="login-screen">
      <AuthBackground />
      <AuthTopbar flow={flow} />

      <MobileScroll className="auth-scroll">
        <AuthScrollContent className="auth-scroll-content auth-scroll-content-form">
          <motion.section
            className="auth-panel auth-panel-form"
            initial={{ y: 44, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="panel-heading">
              <span className="panel-kicker">Acesso seguro</span>
              <h1>Eu me lembro de você...</h1>
              <p>Entre na sua conta para acompanhar tudo em um só lugar.</p>
            </div>

            {authError && <p className="auth-error" role="alert">{authError}</p>}

            <form className="auth-form" onSubmit={submit}>
              <Field
                id="login-email"
                label="E-mail"
                placeholder="voce@email.com"
                value={email}
                onChange={setEmail}
                icon="mail"
              />
              <PasswordField id="login-password" label="Senha" value={password} onChange={setPassword} />
              <button className="text-button" type="button" onClick={(event) => pushScreen(event, flow, resetScreen(email))}>
                Esqueci minha senha
              </button>
              <button className="pill-button" type="submit" disabled={!email || !password || isSubmitting}>
                {isSubmitting ? "Entrando..." : "Entrar na minha conta"}
              </button>
            </form>

            <p className="panel-footer-copy">
              Ainda não tem uma conta?{" "}
              <button type="button" className="inline-button" onClick={(event) => pushScreen(event, flow, signupScreen())}>
                Criar agora
              </button>
            </p>
          </motion.section>
        </AuthScrollContent>
      </MobileScroll>
    </div>
  );
}

function SignupScreen({ flow }: { flow: FlowControls }) {
  const keyboard = useKeyboard();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [signupStep, setSignupStep] = useState<0 | 1 | 2 | 3>(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [authError, setAuthError] = useState("");
  const [successMessage, setSuccessMessage] = useState("Conta criada. Verifique seu e-mail para confirmar o acesso.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stepContent = [
    {
      kicker: "Etapa 1 de 4",
      title: "Como podemos te chamar?",
      description: "Comece pelo essencial para personalizarmos seu espaço.",
    },
    {
      kicker: "Etapa 2 de 4",
      title: "Qual é o seu e-mail?",
      description: "Vamos usar ele para proteger e confirmar sua conta.",
    },
    {
      kicker: "Etapa 3 de 4",
      title: "Crie uma senha segura.",
      description: "Use pelo menos 8 caracteres para manter tudo protegido.",
    },
    {
      kicker: "Seu toque final",
      title: "Adicione uma foto.",
      description: "Ajude a deixar seu espaço mais pessoal. Você pode pular por enquanto.",
    },
  ][signupStep];

  const emailIsValid = email.includes("@") && email.includes(".");
  const canAdvance = signupStep === 0 ? Boolean(name.trim()) : signupStep === 1 ? emailIsValid : password.length >= 8;

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAuthError("Escolha uma imagem para usar como foto de perfil.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
    setAuthError("");
  };

  const goToPreviousSignupStep = () => {
    keyboard.hide();
    setAuthError("");
    setSignupStep((step) => (step > 0 ? ((step - 1) as 0 | 1 | 2 | 3) : 0));
  };

  const advanceSignupStep = () => {
    keyboard.hide();
    setAuthError("");
    setSignupStep((step) => (step < 3 ? ((step + 1) as 0 | 1 | 2 | 3) : 3));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    keyboard.hide();
    setAuthError("");

    if (!supabase) {
      setAuthError("A conexão com o Supabase ainda não foi configurada.");
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: name },
      },
    });

    if (error) {
      setAuthError(authErrorMessage(error));
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      flow.replace(dashboardScreen());
      return;
    }

    setSuccessMessage("Conta criada. Verifique seu e-mail para confirmar o acesso.");
    setSubmitted(true);
    setIsSubmitting(false);
  };

  return (
    <div className="auth-screen auth-screen-signup" data-testid="signup-screen">
      <AuthTopbar flow={flow} onBack={signupStep > 0 ? goToPreviousSignupStep : undefined} showBrand={false} />
      <img src={logoAsset} alt="MaisCtrl" className="signup-brand-mark" draggable={false} />

      <MobileScroll className="auth-scroll">
        <AuthScrollContent className="auth-scroll-content auth-scroll-content-form">
          <motion.section
            className="auth-panel auth-panel-form"
            initial={{ y: 44, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="panel-heading">
              <span className="panel-kicker">{stepContent.kicker}</span>
              <h1>{stepContent.title}</h1>
              <p>{stepContent.description}</p>
            </div>

            <div className="signup-progress" aria-label={`Etapa ${signupStep + 1} de 4`}>
              {[0, 1, 2, 3].map((step) => (
                <span key={step} data-active={step <= signupStep ? "true" : "false"} />
              ))}
            </div>

            {authError && <p className="auth-error" role="alert">{authError}</p>}

            {submitted ? (
              <AuthSuccess message={successMessage} onReset={() => setSubmitted(false)} />
            ) : (
              <form className="auth-form" onSubmit={submit}>
                {signupStep === 0 && (
                  <label className="mobile-field" htmlFor="signup-name">
                    <span className="field-label">Nome completo</span>
                    <span className="input-shell">
                      <KeyboardInput
                        id="signup-name"
                        value={name}
                        placeholder="Como podemos te chamar?"
                        onChange={(event) => setName(event.target.value)}
                      />
                    </span>
                  </label>
                )}

                {signupStep === 1 && (
                  <Field
                    id="signup-email"
                    label="E-mail"
                    placeholder="voce@email.com"
                    value={email}
                    onChange={setEmail}
                    icon="mail"
                  />
                )}

                {signupStep === 2 && (
                  <PasswordField id="signup-password" label="Crie uma senha" value={password} onChange={setPassword} />
                )}

                {signupStep === 3 && (
                  <div className="signup-photo-step">
                    <button
                      className="signup-avatar-picker"
                      type="button"
                      aria-label={avatarPreview ? "Trocar foto de perfil" : "Escolher foto de perfil"}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {avatarPreview ? <img src={avatarPreview} alt="Prévia da foto de perfil" /> : <PersonIcon aria-hidden="true" />}
                    </button>
                    <input
                      ref={avatarInputRef}
                      className="signup-avatar-input"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                    />
                    <div className="signup-photo-copy">
                      <strong>{avatarPreview ? "Foto escolhida" : "Sua foto de perfil"}</strong>
                      <span>{avatarPreview ? "Você pode trocar quando quiser." : "JPG ou PNG · opcional"}</span>
                    </div>
                    <button className="signup-photo-button" type="button" onClick={() => avatarInputRef.current?.click()}>
                      {avatarPreview ? "Trocar foto" : "Escolher foto"}
                    </button>
                  </div>
                )}

                {signupStep < 2 ? (
                  <button className="pill-button" type="button" disabled={!canAdvance} onClick={advanceSignupStep}>
                    Continuar
                  </button>
                ) : signupStep === 2 ? (
                  <button className="pill-button" type="button" disabled={!canAdvance} onClick={advanceSignupStep}>
                    Continuar
                  </button>
                ) : (
                  <button className="pill-button" type="submit" disabled={!name || !emailIsValid || password.length < 8 || isSubmitting}>
                    {isSubmitting ? "Criando..." : "Criar minha conta"}
                  </button>
                )}
              </form>
            )}

            {!submitted && (
              <p className="panel-footer-copy">
                Já possui acesso?{" "}
                <button type="button" className="inline-button" onClick={(event) => pushScreen(event, flow, loginScreen())}>
                  Entrar
                </button>
              </p>
            )}
          </motion.section>
        </AuthScrollContent>
      </MobileScroll>
    </div>
  );
}

function ResetScreen({ flow, initialEmail }: { flow: FlowControls; initialEmail: string }) {
  const keyboard = useKeyboard();
  const [email, setEmail] = useState(initialEmail);
  const [submitted, setSubmitted] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    keyboard.hide();
    setAuthError("");

    if (!supabase) {
      setAuthError("A conexão com o Supabase ainda não foi configurada.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

    if (error) {
      setAuthError(authErrorMessage(error));
      setIsSubmitting(false);
      return;
    }

    setSubmitted(true);
    setIsSubmitting(false);
  };

  return (
    <div className="auth-screen" data-testid="reset-screen">
      <AuthBackground />
      <AuthTopbar flow={flow} />

      <MobileScroll className="auth-scroll">
        <AuthScrollContent className="auth-scroll-content auth-scroll-content-form">
          <motion.section
            className="auth-panel auth-panel-form"
            initial={{ y: 44, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="panel-heading">
              <span className="panel-kicker">Recupere o acesso</span>
              <h1>Senha nova, cabeça leve.</h1>
              <p>Vamos enviar um link para confirmar que a conta é sua.</p>
            </div>

            {authError && <p className="auth-error" role="alert">{authError}</p>}

            {submitted ? (
              <AuthSuccess message="Se o e-mail existir, você receberá as instruções." onReset={() => setSubmitted(false)} />
            ) : (
              <form className="auth-form" onSubmit={submit}>
                <Field
                  id="reset-email"
                  label="E-mail da conta"
                  placeholder="voce@email.com"
                  value={email}
                  onChange={setEmail}
                  icon="mail"
                />
                <button className="pill-button" type="submit" disabled={!email || isSubmitting}>
                  {isSubmitting ? "Enviando..." : "Enviar link"}
                </button>
              </form>
            )}
          </motion.section>
        </AuthScrollContent>
      </MobileScroll>
    </div>
  );
}

type DashboardTab = "overview" | "subscriptions" | "calendar" | "profile";

type MobileSubscription = {
  id: string;
  name: string;
  value: number;
  frequency: string;
  payment_method: string;
  renewal_date: string;
  is_shared?: boolean;
  trial_end_date?: string | null;
};

type MobileProfile = {
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  avatar_url: string | null;
};

type MobilePlan = {
  plan: string;
  status: string;
  current_period_end: string | null;
};

type MobileNotification = {
  id: string;
  title: string;
  description: string;
  date: string;
  tone: "red" | "orange" | "violet";
  subscription: MobileSubscription;
};

type SubscriptionTone = "red" | "green" | "orange";

type SubscriptionTarget = {
  id: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
});

const agendaDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
});

const monthDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

const selectedDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});

const calendarWeekdays = ["D", "S", "T", "Q", "Q", "S", "S"];

function asCalendarDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatShortDate(value: string) {
  const date = asCalendarDate(value);
  return date ? shortDateFormatter.format(date) : "--";
}

function formatAgendaDate(value: string) {
  const date = asCalendarDate(value);
  return date ? agendaDateFormatter.format(date) : "data indefinida";
}

function calendarDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarMonthTitle(date: Date) {
  const title = monthDateFormatter.format(date);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function calendarSelectedDateTitle(date: Date) {
  const title = selectedDateFormatter.format(date);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function calendarDaysForMonth(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days: Array<Date | null> = Array.from({ length: firstDay.getDay() }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(month.getFullYear(), month.getMonth(), day));
  }

  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function monthlySubscriptionValue(subscription: MobileSubscription) {
  return subscription.frequency === "annual" ? subscription.value / 12 : subscription.value;
}

function formatFrequency(frequency: string) {
  return ({
    daily: "diária",
    weekly: "semanal",
    monthly: "mensal",
    quarterly: "trimestral",
    annual: "anual",
  } as Record<string, string>)[frequency] ?? frequency;
}

function formatPlan(plan: MobilePlan | null) {
  if (!plan || plan.plan === "free") return "Free";
  if (plan.plan === "lifetime") return "Vitalício";
  if (plan.plan === "premium" && plan.status === "canceled") return "Premium cancelado";
  return "Premium";
}

function formatPlanDetail(plan: MobilePlan | null) {
  if (plan?.plan === "lifetime") return "Acesso vitalício";
  if (plan?.current_period_end) return `até ${formatAgendaDate(plan.current_period_end)}`;
  return "Plano padrão";
}

function daysUntil(value: string) {
  const date = asCalendarDate(value);
  if (!date) return Number.POSITIVE_INFINITY;

  const today = new Date();
  const todayAtNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return Math.ceil((date.getTime() - todayAtNoon.getTime()) / 86_400_000);
}

function buildNotifications(subscriptions: MobileSubscription[]) {
  return subscriptions.flatMap((subscription): MobileNotification[] => {
    const notifications: MobileNotification[] = [];
    const renewalDays = daysUntil(subscription.renewal_date);

    if (renewalDays < 0) {
      notifications.push({
        id: `${subscription.id}-overdue`,
        title: `${subscription.name} está atrasada`,
        description: `Venceu em ${formatAgendaDate(subscription.renewal_date)}.`,
        date: subscription.renewal_date,
        tone: "red",
        subscription,
      });
    } else if (renewalDays <= 7) {
      notifications.push({
        id: `${subscription.id}-renewal`,
        title: renewalDays === 0 ? `${subscription.name} vence hoje` : `${subscription.name} vence em ${renewalDays} dias`,
        description: `${formatCurrency(subscription.value)} · ${formatAgendaDate(subscription.renewal_date)}.`,
        date: subscription.renewal_date,
        tone: renewalDays <= 2 ? "orange" : "violet",
        subscription,
      });
    }

    if (subscription.trial_end_date) {
      const trialDays = daysUntil(subscription.trial_end_date);
      if (trialDays < 0) {
        notifications.push({
          id: `${subscription.id}-trial-ended`,
          title: `O teste de ${subscription.name} terminou`,
          description: `Terminou em ${formatAgendaDate(subscription.trial_end_date)}.`,
          date: subscription.trial_end_date,
          tone: "red",
          subscription,
        });
      } else if (trialDays <= 7) {
        notifications.push({
          id: `${subscription.id}-trial`,
          title: trialDays === 0 ? `O teste de ${subscription.name} termina hoje` : `O teste de ${subscription.name} termina em ${trialDays} dias`,
          description: `Data final: ${formatAgendaDate(subscription.trial_end_date)}.`,
          date: subscription.trial_end_date,
          tone: "orange",
          subscription,
        });
      }
    }

    return notifications;
  }).sort((first, second) => {
    const firstDate = asCalendarDate(first.subscription.renewal_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    const secondDate = asCalendarDate(second.subscription.renewal_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    return firstDate - secondDate;
  });
}

const nativeNotificationStorageKey = "maisctrl-native-notification-ids";

function nativeNotificationId(value: string) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash) || 1;
}

function nativeNotificationDate(value: string) {
  const date = asCalendarDate(value);
  if (!date) return null;

  date.setHours(9, 0, 0, 0);
  if (date.getTime() <= Date.now()) date.setTime(Date.now() + 60_000);
  return date;
}

async function syncNativeNotifications(notifications: MobileNotification[], requestPermission = false) {
  if (!Capacitor.isNativePlatform()) return { status: "unavailable" as const, count: 0 };

  try {
    const permission = await LocalNotifications.checkPermissions();
    let display = permission.display;
    if (requestPermission && display !== "granted") {
      display = (await LocalNotifications.requestPermissions()).display;
    }
    if (display !== "granted") return { status: "denied" as const, count: 0 };

    const storedIds = JSON.parse(localStorage.getItem(nativeNotificationStorageKey) ?? "[]") as number[];
    if (storedIds.length > 0) {
      await LocalNotifications.cancel({ notifications: storedIds.map((id) => ({ id })) });
    }

    const reminders = notifications
      .filter((notification) => {
        const days = daysUntil(notification.date);
        return days >= 0 && days <= 7 && nativeNotificationDate(notification.date);
      })
      .map((notification) => ({
        id: nativeNotificationId(notification.id),
        title: "MaisCtrl",
        body: notification.title,
        schedule: { at: nativeNotificationDate(notification.date) ?? new Date(Date.now() + 60_000) },
        isExactNotification: false,
        extra: { source: "maisctrl", subscriptionId: notification.subscription.id },
      }));

    if (reminders.length > 0) await LocalNotifications.schedule({ notifications: reminders });
    localStorage.setItem(nativeNotificationStorageKey, JSON.stringify(reminders.map((notification) => notification.id)));
    return { status: "enabled" as const, count: reminders.length };
  } catch {
    return { status: "error" as const, count: 0 };
  }
}

type PushStatus = "enabled" | "denied" | "unavailable" | "error";

let pushListenerUserId = "";
let pushListeners: Array<{ remove: () => Promise<void> }> = [];

async function savePushToken(userId: string, token: string) {
  if (!supabase || !token) return false;

  const platform = Capacitor.getPlatform();
  if (platform !== "android" && platform !== "ios") return false;

  const { error } = await supabase.from("push_devices").upsert({
    user_id: userId,
    token,
    platform,
    enabled: true,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "token" });

  return !error;
}

async function preparePushListeners(userId: string) {
  if (!Capacitor.isNativePlatform() || !supabase) return;
  if (pushListenerUserId === userId && pushListeners.length > 0) return;

  await Promise.all(pushListeners.map((listener) => listener.remove()));
  pushListeners = [];

  const registrationListener = await PushNotifications.addListener("registration", ({ value }) => {
    void savePushToken(userId, value);
  });
  const registrationErrorListener = await PushNotifications.addListener("registrationError", (error) => {
    console.warn("Não foi possível registrar o push do MaisCtrl.", error);
  });

  pushListeners = [registrationListener, registrationErrorListener];
  pushListenerUserId = userId;
}

async function syncPushRegistration(userId: string, requestPermission = false): Promise<PushStatus> {
  if (!Capacitor.isNativePlatform() || !supabase) return "unavailable";

  try {
    await preparePushListeners(userId);
    let permission = await PushNotifications.checkPermissions();
    if (requestPermission && permission.receive !== "granted") {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== "granted") return "denied";

    await PushNotifications.register();
    return "enabled";
  } catch {
    return "error";
  }
}

async function clearPushRegistration(userId: string) {
  if (!supabase || !Capacitor.isNativePlatform()) return;

  await supabase.from("push_devices").delete().eq("user_id", userId);
  await PushNotifications.unregister().catch(() => undefined);
}

function subscriptionTone(index: number): SubscriptionTone {
  return (["red", "green", "orange"] as const)[index % 3];
}

function subscriptionTarget(subscription: MobileSubscription): SubscriptionTarget | null {
  if (subscription.is_shared || subscription.id.startsWith("shared-") || subscription.id.startsWith("partner-")) return null;
  return { id: subscription.id };
}

function nextRenewalDate(subscription: MobileSubscription) {
  const date = asCalendarDate(subscription.renewal_date);
  if (!date) return null;

  const nextDate = new Date(date);
  if (subscription.frequency === "daily") nextDate.setDate(nextDate.getDate() + 1);
  else if (subscription.frequency === "weekly") nextDate.setDate(nextDate.getDate() + 7);
  else if (subscription.frequency === "quarterly") nextDate.setMonth(nextDate.getMonth() + 3);
  else if (subscription.frequency === "annual") nextDate.setFullYear(nextDate.getFullYear() + 1);
  else nextDate.setMonth(nextDate.getMonth() + 1);

  const year = nextDate.getFullYear();
  const month = String(nextDate.getMonth() + 1).padStart(2, "0");
  const day = String(nextDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function subscriptionDisplayName(user: { email?: string; user_metadata?: Record<string, unknown> } | null) {
  const fullName = user?.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim().split(/\s+/)[0];

  const emailName = user?.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!emailName) return "você";
  return emailName.charAt(0).toUpperCase() + emailName.slice(1);
}

async function fetchMobileSubscriptions(userId: string) {
  if (!supabase) return [] as MobileSubscription[];

  const { data: normalSubscriptions, error: normalError } = await supabase
    .from("subscriptions")
    .select("id,name,value,frequency,payment_method,renewal_date,trial_end_date")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (normalError) throw normalError;

  const combined: MobileSubscription[] = (normalSubscriptions ?? []).map((subscription) => ({
    id: subscription.id,
    name: subscription.name,
    value: Number(subscription.value),
    frequency: subscription.frequency,
    payment_method: subscription.payment_method,
    renewal_date: subscription.renewal_date,
    is_shared: false,
    trial_end_date: subscription.trial_end_date,
  }));

  const { data: ownedShared, error: ownedSharedError } = await supabase
    .from("shared_subscriptions")
    .select("id,name,total_value,frequency,payment_method,renewal_date,is_active")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!ownedSharedError && ownedShared) {
    combined.push(...ownedShared.map((subscription) => ({
      id: `shared-${subscription.id}`,
      name: subscription.name,
      value: 0,
      frequency: subscription.frequency,
      payment_method: subscription.payment_method,
      renewal_date: subscription.renewal_date,
      is_shared: true,
    })));

  }

  const { data: partnerLinks, error: partnerLinksError } = await supabase
    .from("shared_subscription_partners")
    .select("id,shared_subscription_id,value")
    .eq("user_id", userId);

  if (!partnerLinksError && partnerLinks && partnerLinks.length > 0) {
    const { data: partnerSharedSubscriptions } = await supabase
      .from("shared_subscriptions")
      .select("id,name,total_value,frequency,payment_method,renewal_date,is_active")
      .in("id", partnerLinks.map((link) => link.shared_subscription_id))
      .eq("is_active", true);

    for (const partner of partnerLinks) {
      const sharedSubscription = partnerSharedSubscriptions?.find((subscription) => subscription.id === partner.shared_subscription_id);
      if (!sharedSubscription) continue;

      combined.push({
        id: `partner-${partner.id}`,
        name: sharedSubscription.name,
        value: Number(partner.value),
        frequency: sharedSubscription.frequency,
        payment_method: sharedSubscription.payment_method,
        renewal_date: sharedSubscription.renewal_date,
        is_shared: true,
      });
    }
  }

  return combined.sort((a, b) => {
    const aDate = asCalendarDate(a.renewal_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDate = asCalendarDate(b.renewal_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    return aDate - bDate;
  });
}

function useMobileSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<MobileSubscription[]>([]);
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [plan, setPlan] = useState<MobilePlan | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("você");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      setError("");

      if (!supabase) {
        if (!active) return;
        setIsLoading(false);
        setError("A conexão com o Supabase ainda não foi configurada.");
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        if (!active) return;
        setIsLoading(false);
        setError(sessionError ? "Não foi possível validar sua sessão." : "Sua sessão expirou. Entre novamente.");
        return;
      }

      const user = sessionData.session.user;
      try {
        const [nextSubscriptions, profileResult, planResult] = await Promise.all([
          fetchMobileSubscriptions(user.id),
          supabase.from("profiles").select("full_name,email,phone_number,avatar_url").eq("id", user.id).maybeSingle(),
          supabase.from("user_subscriptions").select("plan,status,current_period_end").eq("user_id", user.id).maybeSingle(),
        ]);
        if (!active) return;
        setSubscriptions(nextSubscriptions);
        setProfile(profileResult.data);
        setPlan(planResult.data);
        setUserEmail(user.email ?? "");
        setUserName(subscriptionDisplayName({
          email: user.email,
          user_metadata: { full_name: profileResult.data?.full_name ?? user.user_metadata?.full_name },
        }));
        void syncPushRegistration(user.id);
        void syncNativeNotifications(buildNotifications(nextSubscriptions));
      } catch {
        if (!active) return;
        setError("Não foi possível carregar suas assinaturas agora.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  return {
    subscriptions,
    profile,
    plan,
    userEmail,
    userName,
    isLoading,
    error,
    refresh: () => setReloadKey((current) => current + 1),
  };
}

function AddSubscriptionSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const keyboard = useKeyboard();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [paymentMethod, setPaymentMethod] = useState("credit");
  const [renewalDate, setRenewalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [trialEndDate, setTrialEndDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => keyboard.hide(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const reset = () => {
    setName("");
    setValue("");
    setFrequency("monthly");
    setPaymentMethod("credit");
    setRenewalDate(new Date().toISOString().slice(0, 10));
    setTrialEndDate("");
    setError("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      keyboard.hide();
      reset();
    }
    onOpenChange(nextOpen);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    keyboard.hide();
    setError("");

    const parsedValue = Number(value.replace(",", "."));
    if (!name.trim() || !Number.isFinite(parsedValue) || parsedValue <= 0 || !renewalDate) {
      setError("Preencha nome, valor e data de renovação.");
      return;
    }

    if (!supabase) {
      setError("A conexão com o Supabase ainda não foi configurada.");
      return;
    }

    setIsSaving(true);
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      setError("Sua sessão expirou. Entre novamente para cadastrar uma assinatura.");
      setIsSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("subscriptions").insert({
      user_id: sessionData.session.user.id,
      name: name.trim(),
      value: parsedValue,
      frequency,
      payment_method: paymentMethod,
      renewal_date: renewalDate,
      trial_end_date: trialEndDate || null,
      is_active: true,
    });

    if (insertError) {
      setError("Não foi possível cadastrar essa assinatura agora.");
      setIsSaving(false);
      return;
    }

    onCreated();
    setIsSaving(false);
    handleOpenChange(false);
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      title="Nova assinatura"
      description="Cadastre uma cobrança para acompanhar seus próximos pagamentos."
      snap={0.72}
    >
      <form className="subscription-form" onSubmit={submit}>
        <label className="mobile-field" htmlFor="subscription-name">
          <span className="field-label">Nome</span>
          <span className="input-shell">
            <KeyboardInput
              id="subscription-name"
              value={name}
              placeholder="Ex.: Netflix"
              autoCapitalize="sentences"
              autoCorrect="off"
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
            />
          </span>
        </label>

        <label className="mobile-field" htmlFor="subscription-value">
          <span className="field-label">Valor por cobrança</span>
          <span className="input-shell">
            <span className="input-prefix">R$</span>
            <KeyboardInput
              id="subscription-value"
              type="text"
              inputMode="decimal"
              value={value}
              placeholder="29,90"
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
              }}
            />
          </span>
        </label>

        <div className="subscription-form-grid">
          <label className="mobile-field" htmlFor="subscription-frequency">
            <span className="field-label">Frequência</span>
            <select id="subscription-frequency" value={frequency} onChange={(event) => {
              setFrequency(event.target.value);
              setError("");
            }}>
              <option value="daily">Diária</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
              <option value="quarterly">Trimestral</option>
              <option value="annual">Anual</option>
            </select>
          </label>

          <label className="mobile-field" htmlFor="subscription-payment">
            <span className="field-label">Pagamento</span>
            <select id="subscription-payment" value={paymentMethod} onChange={(event) => {
              setPaymentMethod(event.target.value);
              setError("");
            }}>
              <option value="credit">Crédito</option>
              <option value="debit">Débito</option>
              <option value="pix">PIX</option>
              <option value="boleto">Boleto</option>
            </select>
          </label>
        </div>

        <label className="mobile-field" htmlFor="subscription-renewal">
          <span className="field-label">Próxima renovação</span>
          <span className="input-shell">
            <KeyboardInput id="subscription-renewal" type="date" value={renewalDate} onChange={(event) => {
              setRenewalDate(event.target.value);
              setError("");
            }} />
          </span>
        </label>

        <label className="mobile-field" htmlFor="subscription-trial-end">
          <span className="field-label">Fim do teste <small>(opcional)</small></span>
          <span className="input-shell">
            <KeyboardInput id="subscription-trial-end" type="date" value={trialEndDate} onChange={(event) => {
              setTrialEndDate(event.target.value);
              setError("");
            }} />
          </span>
        </label>

        {error && <p className="auth-error subscription-form-error" role="alert">{error}</p>}

        <button className="dashboard-primary-button subscription-submit" type="submit" disabled={isSaving}>
          {isSaving ? "Salvando..." : "Cadastrar assinatura"}
        </button>
      </form>
    </BottomSheet>
  );
}

function SubscriptionActionSheet({
  subscription,
  open,
  onOpenChange,
  onChanged,
}: {
  subscription: MobileSubscription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const keyboard = useKeyboard();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [paymentMethod, setPaymentMethod] = useState("credit");
  const [renewalDate, setRenewalDate] = useState("");
  const [trialEndDate, setTrialEndDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !subscription) return;
    setMode("view");
    setConfirmDelete(false);
    setName(subscription.name);
    setValue(String(subscription.value).replace(".", ","));
    setFrequency(subscription.frequency);
    setPaymentMethod(subscription.payment_method);
    setRenewalDate(subscription.renewal_date.slice(0, 10));
    setTrialEndDate(subscription.trial_end_date?.slice(0, 10) ?? "");
    setError("");
  }, [open, subscription?.id]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => keyboard.hide(), 0);
    return () => window.clearTimeout(timer);
  }, [open, mode]);

  if (!subscription) return null;

  const target = subscriptionTarget(subscription);
  const isReadOnly = !target;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      keyboard.hide();
      setMode("view");
      setConfirmDelete(false);
      setError("");
    }
    onOpenChange(nextOpen);
  };

  const runMutation = async (mutation: (userId: string) => PromiseLike<{ error: { message?: string } | null }>) => {
    setError("");
    if (!supabase || !target) {
      setError("Essa assinatura compartilhada é somente leitura aqui.");
      return false;
    }

    setIsSaving(true);
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      setError("Sua sessão expirou. Entre novamente para continuar.");
      setIsSaving(false);
      return false;
    }

    const result = await mutation(sessionData.session.user.id);
    if (result.error) {
      setError("Não foi possível atualizar essa assinatura agora.");
      setIsSaving(false);
      return false;
    }

    onChanged();
    setIsSaving(false);
    handleOpenChange(false);
    return true;
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    keyboard.hide();
    const parsedValue = Number(value.replace(",", "."));
    if (!name.trim() || !Number.isFinite(parsedValue) || parsedValue <= 0 || !renewalDate) {
      setError("Preencha nome, valor e data de renovação.");
      return;
    }

    await runMutation((userId) => supabase!.from("subscriptions").update({
      name: name.trim(),
      value: parsedValue,
      frequency,
      payment_method: paymentMethod,
      renewal_date: renewalDate,
      trial_end_date: trialEndDate || null,
    }).eq("id", target!.id).eq("user_id", userId));
  };

  const handleMarkAsPaid = async () => {
    const nextDate = nextRenewalDate(subscription);
    if (!nextDate) {
      setError("A data de renovação dessa assinatura é inválida.");
      return;
    }

    await runMutation((userId) => supabase!.from("subscriptions").update({ renewal_date: nextDate }).eq("id", target!.id).eq("user_id", userId));
  };

  const handleDelete = async () => {
    await runMutation((userId) => supabase!.from("subscriptions").delete().eq("id", target!.id).eq("user_id", userId));
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={mode === "edit" ? "Editar assinatura" : subscription.name}
      description={mode === "edit" ? "Atualize os dados dessa cobrança." : "Detalhes e ações da assinatura."}
      snap={0.72}
    >
      {mode === "view" ? (
        <div className="subscription-sheet-content">
          <div className="subscription-sheet-summary">
            <div><span>Valor</span><strong>{formatCurrency(subscription.value)}</strong></div>
            <div><span>Frequência</span><strong>{formatFrequency(subscription.frequency)}</strong></div>
            <div><span>Próxima renovação</span><strong>{formatAgendaDate(subscription.renewal_date)}</strong></div>
            <div><span>Pagamento</span><strong>{subscription.payment_method}</strong></div>
          </div>

          {isReadOnly ? (
            <p className="subscription-sheet-note">Assinaturas compartilhadas são gerenciadas pela área de compartilhamento.</p>
          ) : (
            <div className="subscription-sheet-actions">
              <button className="dashboard-primary-button subscription-sheet-button" type="button" onClick={() => setMode("edit")}>
                Editar assinatura
              </button>
              <button className="dashboard-secondary-button" type="button" onClick={handleMarkAsPaid} disabled={isSaving}>
                {isSaving ? "Atualizando..." : "Marcar como paga"}
              </button>

              {confirmDelete ? (
                <div className="subscription-sheet-warning">
                  <strong>Excluir esta assinatura?</strong>
                  <span>Essa ação não pode ser desfeita.</span>
                  <div className="subscription-sheet-confirm-actions">
                    <button className="dashboard-secondary-button" type="button" onClick={() => setConfirmDelete(false)} disabled={isSaving}>Cancelar</button>
                    <button className="dashboard-danger-button" type="button" onClick={handleDelete} disabled={isSaving}>{isSaving ? "Excluindo..." : "Excluir"}</button>
                  </div>
                </div>
              ) : (
                <button className="dashboard-danger-button" type="button" onClick={() => setConfirmDelete(true)} disabled={isSaving}>Excluir assinatura</button>
              )}
            </div>
          )}

          {error && <p className="auth-error subscription-form-error" role="alert">{error}</p>}
        </div>
      ) : (
        <form className="subscription-form" onSubmit={handleSave}>
          <label className="mobile-field" htmlFor="edit-subscription-name">
            <span className="field-label">Nome</span>
            <span className="input-shell">
              <KeyboardInput id="edit-subscription-name" value={name} onChange={(event) => setName(event.target.value)} />
            </span>
          </label>

          <label className="mobile-field" htmlFor="edit-subscription-value">
            <span className="field-label">Valor por cobrança</span>
            <span className="input-shell">
              <span className="input-prefix">R$</span>
              <KeyboardInput id="edit-subscription-value" type="text" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} />
            </span>
          </label>

          <div className="subscription-form-grid">
            <label className="mobile-field" htmlFor="edit-subscription-frequency">
              <span className="field-label">Frequência</span>
              <select id="edit-subscription-frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)}>
                <option value="daily">Diária</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
                <option value="quarterly">Trimestral</option>
                <option value="annual">Anual</option>
              </select>
            </label>

            <label className="mobile-field" htmlFor="edit-subscription-payment">
              <span className="field-label">Pagamento</span>
              <select id="edit-subscription-payment" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                <option value="credit">Crédito</option>
                <option value="debit">Débito</option>
                <option value="pix">PIX</option>
                <option value="boleto">Boleto</option>
              </select>
            </label>
          </div>

          <label className="mobile-field" htmlFor="edit-subscription-renewal">
            <span className="field-label">Próxima renovação</span>
            <span className="input-shell">
              <KeyboardInput id="edit-subscription-renewal" type="date" value={renewalDate} onChange={(event) => setRenewalDate(event.target.value)} />
            </span>
          </label>

          <label className="mobile-field" htmlFor="edit-subscription-trial-end">
            <span className="field-label">Fim do teste <small>(opcional)</small></span>
            <span className="input-shell">
              <KeyboardInput id="edit-subscription-trial-end" type="date" value={trialEndDate} onChange={(event) => setTrialEndDate(event.target.value)} />
            </span>
          </label>

          {error && <p className="auth-error subscription-form-error" role="alert">{error}</p>}
          <button className="dashboard-primary-button subscription-submit" type="submit" disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar alterações"}
          </button>
        </form>
      )}
    </BottomSheet>
  );
}

function NotificationSheet({
  notifications,
  open,
  onOpenChange,
  onOpenSubscription,
}: {
  notifications: MobileNotification[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSubscription: (subscription: MobileSubscription) => void;
}) {
  const keyboard = useKeyboard();
  const [nativeStatus, setNativeStatus] = useState<"checking" | "enabled" | "disabled" | "unavailable">("checking");
  const [pushStatus, setPushStatus] = useState<PushStatus>("unavailable");
  const [isEnablingNative, setIsEnablingNative] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!Capacitor.isNativePlatform()) {
      setNativeStatus("unavailable");
      setPushStatus("unavailable");
      return;
    }

    LocalNotifications.checkPermissions()
      .then(({ display }) => setNativeStatus(display === "granted" ? "enabled" : "disabled"))
      .catch(() => setNativeStatus("disabled"));

    if (!supabase) {
      setPushStatus("unavailable");
      return;
    }

    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!data.session) {
          setPushStatus("denied");
          return;
        }
        const permission = await PushNotifications.checkPermissions();
        setPushStatus(permission.receive === "granted" ? "enabled" : "denied");
      })
      .catch(() => setPushStatus("error"));
  }, [open]);

  const enableNativeNotifications = async () => {
    setIsEnablingNative(true);
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const userId = data.session?.user.id;
    const result = userId ? await syncPushRegistration(userId, true) : "denied";
    setPushStatus(result);
    setIsEnablingNative(false);
  };

  const handleNotificationClick = (subscription: MobileSubscription) => {
    keyboard.hide();
    onOpenChange(false);
    onOpenSubscription(subscription);
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Notificações"
      description={notifications.length > 0 ? "O que merece sua atenção agora." : "Você está em dia com suas assinaturas."}
      snap={0.68}
    >
      {pushStatus !== "unavailable" && pushStatus !== "error" ? (
        <div className="dashboard-native-notification-card" data-enabled={pushStatus === "enabled"}>
          <span className="dashboard-notification-icon" data-tone={pushStatus === "enabled" ? "violet" : "orange"}>
            <BellIcon aria-hidden="true" />
          </span>
          <span className="dashboard-native-notification-copy">
            <strong>{pushStatus === "enabled" ? "Push do celular ativo" : "Receba alertas mesmo fora do app"}</strong>
            <small>{pushStatus === "enabled" ? "Os próximos vencimentos serão enviados para este aparelho." : "Ative o push para ser avisado quando uma cobrança se aproximar."}</small>
          </span>
          {pushStatus !== "enabled" && (
            <button className="dashboard-inline-button" type="button" onClick={enableNativeNotifications} disabled={isEnablingNative}>
              {isEnablingNative ? "Ativando..." : "Ativar"}
            </button>
          )}
        </div>
      ) : pushStatus === "unavailable" ? (
        <p className="dashboard-native-notification-note">No navegador, os avisos ficam disponíveis dentro do app. No app instalado, você poderá ativar lembretes do celular.</p>
      ) : (
        <p className="dashboard-native-notification-note">Não foi possível preparar o push agora. Verifique as permissões do aparelho e tente novamente.</p>
      )}
      {notifications.length > 0 ? (
        <div className="dashboard-notification-list">
          {notifications.map((notification) => (
            <button
              className="dashboard-notification-item"
              key={notification.id}
              type="button"
              onClick={() => handleNotificationClick(notification.subscription)}
            >
              <span className="dashboard-notification-icon" data-tone={notification.tone}>
                <BellIcon aria-hidden="true" />
              </span>
              <span className="dashboard-notification-copy">
                <strong>{notification.title}</strong>
                <small>{notification.description}</small>
              </span>
              <ChevronRightIcon aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        <div className="dashboard-data-state dashboard-notification-empty">
          <span className="dashboard-notification-empty-icon"><CheckCircledIcon aria-hidden="true" /></span>
          <strong>Nenhum alerta por enquanto</strong>
          <span>Quando uma cobrança estiver próxima, ela aparecerá aqui.</span>
        </div>
      )}
    </BottomSheet>
  );
}

function EditProfileSheet({
  profile,
  open,
  onOpenChange,
  onSaved,
}: {
  profile: MobileProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const keyboard = useKeyboard();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setFullName(profile?.full_name ?? "");
    setPhoneNumber(profile?.phone_number ?? "");
    setAvatarFile(null);
    setAvatarPreview(profile?.avatar_url ?? "");
    setError("");
  }, [open, profile]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) keyboard.hide();
    onOpenChange(nextOpen);
  };

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Escolha uma imagem JPG, PNG ou WEBP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("A foto precisa ter no máximo 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarFile(file);
      setAvatarPreview(typeof reader.result === "string" ? reader.result : "");
      setError("");
    };
    reader.onerror = () => setError("Não foi possível ler essa foto.");
    reader.readAsDataURL(file);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    keyboard.hide();
    setError("");

    if (!fullName.trim()) {
      setError("Informe seu nome completo.");
      return;
    }

    if (!supabase) {
      setError("A conexão com o Supabase ainda não foi configurada.");
      return;
    }

    setIsSaving(true);
    let uploadedPath = "";

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        setError("Sua sessão expirou. Entre novamente para atualizar o perfil.");
        return;
      }

      const userId = sessionData.session.user.id;
      let avatarUrl = profile?.avatar_url ?? null;

      if (avatarFile) {
        const extension = avatarFile.type === "image/png" ? "png" : avatarFile.type === "image/webp" ? "webp" : "jpg";
        uploadedPath = `${userId}/${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(uploadedPath, avatarFile, { contentType: avatarFile.type, upsert: false });

        if (uploadError) throw uploadError;
        avatarUrl = supabase.storage.from("avatars").getPublicUrl(uploadedPath).data.publicUrl;
      }

      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone_number: phoneNumber.trim() || null,
          ...(avatarFile ? { avatar_url: avatarUrl } : {}),
        })
        .eq("id", userId)
        .select("full_name,email,phone_number,avatar_url")
        .maybeSingle();

      if (updateError || !updatedProfile) throw updateError ?? new Error("Profile update returned no row");

      onSaved();
      handleOpenChange(false);
    } catch (submitError) {
      if (uploadedPath) await supabase.storage.from("avatars").remove([uploadedPath]);
      console.error("Não foi possível atualizar o perfil mobile.", submitError);
      setError(avatarFile ? "Não foi possível atualizar seus dados e sua foto." : "Não foi possível atualizar seu perfil agora.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      title="Editar perfil"
      description="Atualize seus dados pessoais."
      snap={0.62}
    >
      <form className="subscription-form profile-form" onSubmit={submit}>
        <div className="profile-avatar-editor">
          <button
            className="profile-avatar-picker"
            type="button"
            aria-label={avatarPreview ? "Trocar foto de perfil" : "Escolher foto de perfil"}
            onClick={() => avatarInputRef.current?.click()}
          >
            {avatarPreview ? <img src={avatarPreview} alt="Prévia da foto de perfil" /> : <PersonIcon aria-hidden="true" />}
          </button>
          <input
            ref={avatarInputRef}
            className="signup-avatar-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarChange}
          />
          <div className="profile-avatar-copy">
            <strong>{avatarFile ? "Foto selecionada" : "Foto de perfil"}</strong>
            <span>JPG, PNG ou WEBP · até 5 MB</span>
          </div>
          <button className="profile-avatar-change" type="button" onClick={() => avatarInputRef.current?.click()}>
            {avatarFile ? "Trocar foto" : "Escolher foto"}
          </button>
        </div>

        <label className="mobile-field" htmlFor="profile-full-name">
          <span className="field-label">Nome completo</span>
          <span className="input-shell">
            <KeyboardInput
              id="profile-full-name"
              value={fullName}
              placeholder="Seu nome completo"
              autoCapitalize="words"
              onChange={(event) => {
                setFullName(event.target.value);
                setError("");
              }}
            />
          </span>
        </label>

        <label className="mobile-field" htmlFor="profile-phone-number">
          <span className="field-label">Telefone <small>(opcional)</small></span>
          <span className="input-shell">
            <KeyboardInput
              id="profile-phone-number"
              type="tel"
              inputMode="tel"
              value={phoneNumber}
              placeholder="(00) 00000-0000"
              onChange={(event) => {
                setPhoneNumber(event.target.value);
                setError("");
              }}
            />
          </span>
        </label>

        <div className="profile-email-note">
          <span>E-mail da conta</span>
          <strong>{profile?.email || "E-mail não informado"}</strong>
          <small>Para trocar o e-mail, será necessária uma confirmação de segurança.</small>
        </div>

        {error && <p className="auth-error subscription-form-error" role="alert">{error}</p>}
        <button className="dashboard-primary-button subscription-submit" type="submit" disabled={isSaving}>
          {isSaving ? "Salvando..." : "Salvar perfil"}
        </button>
      </form>
    </BottomSheet>
  );
}

const dashboardNavItems: Array<{ id: DashboardTab; label: string; icon: ReactNode }> = [
  { id: "overview", label: "Início", icon: <BarChartIcon aria-hidden="true" /> },
  { id: "subscriptions", label: "Assinaturas", icon: <CardStackIcon aria-hidden="true" /> },
  { id: "calendar", label: "Calendário", icon: <CalendarIcon aria-hidden="true" /> },
  { id: "profile", label: "Perfil", icon: <PersonIcon aria-hidden="true" /> },
];

function DashboardScreen({ flow }: { flow: FlowControls }) {
  const { device } = useMobileDevice();
  const keyboard = useKeyboard();
  const subscriptionState = useMobileSubscriptions();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<MobileSubscription | null>(null);
  const [isSubscriptionSheetOpen, setIsSubscriptionSheetOpen] = useState(false);
  const [isNotificationSheetOpen, setIsNotificationSheetOpen] = useState(false);
  const [isEditProfileSheetOpen, setIsEditProfileSheetOpen] = useState(false);
  const notifications = buildNotifications(subscriptionState.subscriptions);

  const openAddSubscription = () => {
    keyboard.hide();
    setIsAddSheetOpen(true);
  };

  const openSubscriptionActions = (subscription: MobileSubscription) => {
    keyboard.hide();
    setSelectedSubscription(subscription);
    setIsSubscriptionSheetOpen(true);
  };

  const openNotifications = () => {
    keyboard.hide();
    setIsNotificationSheetOpen(true);
  };

  const openEditProfile = () => {
    keyboard.hide();
    setIsEditProfileSheetOpen(true);
  };

  const handleSubscriptionSheetChange = (open: boolean) => {
    setIsSubscriptionSheetOpen(open);
    if (!open) setSelectedSubscription(null);
  };

  const signOut = async () => {
    setAccountError("");
    if (!supabase) {
      flow.replace(welcomeScreen());
      return;
    }

    setIsSigningOut(true);
    const { data: currentSession } = await supabase.auth.getSession();
    if (currentSession.session) await clearPushRegistration(currentSession.session.user.id);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAccountError(authErrorMessage(error));
      setIsSigningOut(false);
      return;
    }

    flow.replace(welcomeScreen());
  };

  return (
    <div className="dashboard-screen" data-testid="dashboard-screen">
      <header className="dashboard-topbar">
        <BrandLockup />
        <div className="dashboard-header-actions">
          <button className="dashboard-icon-button dashboard-notification-button" type="button" aria-label="Abrir notificações" onClick={openNotifications}>
            <BellIcon aria-hidden="true" />
            {notifications.length > 0 && <span className="dashboard-notification-badge">{notifications.length > 9 ? "9+" : notifications.length}</span>}
          </button>
          <button className="dashboard-icon-button" type="button" aria-label="Abrir perfil" onClick={() => setActiveTab("profile")}>
            <PersonIcon aria-hidden="true" />
          </button>
        </div>
      </header>

      <MobileScroll className="dashboard-scroll">
        <main className="dashboard-content" style={{ minHeight: device.geometry.screen.height }}>
          {accountError && <p className="auth-error dashboard-account-error" role="alert">{accountError}</p>}
          {activeTab === "overview" ? (
            <DashboardOverview
              {...subscriptionState}
              notificationCount={notifications.length}
              onOpenNotifications={openNotifications}
              onTabChange={setActiveTab}
              onAddSubscription={openAddSubscription}
              onSubscriptionClick={openSubscriptionActions}
            />
          ) : (
            <DashboardModule
              tab={activeTab}
              {...subscriptionState}
              onAddSubscription={openAddSubscription}
              onSubscriptionClick={openSubscriptionActions}
              onEditProfile={openEditProfile}
              onSignOut={signOut}
              isSigningOut={isSigningOut}
            />
          )}
        </main>
      </MobileScroll>

      <nav className="dashboard-bottom-nav" aria-label="Navegação principal">
        {dashboardNavItems.map((item) => (
          <button
            key={item.id}
            className="dashboard-nav-item"
            type="button"
            data-active={activeTab === item.id}
            onClick={() => setActiveTab(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <AddSubscriptionSheet
        open={isAddSheetOpen}
        onOpenChange={setIsAddSheetOpen}
        onCreated={subscriptionState.refresh}
      />

      <SubscriptionActionSheet
        subscription={selectedSubscription}
        open={isSubscriptionSheetOpen}
        onOpenChange={handleSubscriptionSheetChange}
        onChanged={subscriptionState.refresh}
      />

      <NotificationSheet
        notifications={notifications}
        open={isNotificationSheetOpen}
        onOpenChange={setIsNotificationSheetOpen}
        onOpenSubscription={openSubscriptionActions}
      />

      <EditProfileSheet
        profile={subscriptionState.profile}
        open={isEditProfileSheetOpen}
        onOpenChange={setIsEditProfileSheetOpen}
        onSaved={subscriptionState.refresh}
      />
    </div>
  );
}

function DashboardOverview({
  subscriptions,
  isLoading,
  error,
  refresh,
  userName,
  notificationCount,
  onOpenNotifications,
  onTabChange,
  onAddSubscription,
  onSubscriptionClick,
}: {
  subscriptions: MobileSubscription[];
  isLoading: boolean;
  error: string;
  refresh: () => void;
  userName: string;
  notificationCount: number;
  onOpenNotifications: () => void;
  onTabChange: (tab: DashboardTab) => void;
  onAddSubscription: () => void;
  onSubscriptionClick: (subscription: MobileSubscription) => void;
}) {
  const monthlyTotal = subscriptions.reduce((total, subscription) => total + monthlySubscriptionValue(subscription), 0);
  const nextPayment = subscriptions[0] ?? null;
  const averageMonthly = subscriptions.length > 0 ? monthlyTotal / subscriptions.length : 0;

  return (
    <>
      <motion.header
        className="dashboard-intro"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="dashboard-eyebrow">Visão geral</span>
        <h1>Bom dia, {userName}.</h1>
        <p>Controle total das suas finanças.</p>
      </motion.header>

      <motion.section
        className="dashboard-total-card"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="dashboard-total-card-glow" aria-hidden="true" />
        <div className="dashboard-card-heading">
          <span>Custo mensal estimado</span>
          <span className="dashboard-trend">{isLoading ? "..." : `${subscriptions.length} ativas`}</span>
        </div>
        <strong>{isLoading ? "..." : formatCurrency(monthlyTotal)}</strong>
        <span className="dashboard-card-caption">
          {isLoading ? "Buscando suas assinaturas..." : subscriptions.length === 0 ? "Nenhuma assinatura ativa" : "soma das cobranças recorrentes"}
        </span>
        <div className="dashboard-total-meta">
          <span>{isLoading ? "Aguarde um instante" : `Projeção anual ${formatCurrency(monthlyTotal * 12)}`}</span>
          <span>{isLoading ? "" : `Média ${formatCurrency(averageMonthly)}`}</span>
        </div>
      </motion.section>

      <section className="dashboard-section">
        <div className="dashboard-section-title-row">
          <div>
            <span className="dashboard-eyebrow">Resumo rápido</span>
            <h2>O que pede atenção</h2>
          </div>
          <button className="dashboard-quiet-button" type="button" onClick={() => onTabChange("subscriptions")}>
            Ver tudo <ChevronRightIcon aria-hidden="true" />
          </button>
        </div>

        <div className="dashboard-metric-grid">
          <DashboardMetric icon={<CardStackIcon aria-hidden="true" />} label="Assinaturas" value={isLoading ? "..." : String(subscriptions.length)} meta="ativas" tone="violet" onClick={() => onTabChange("subscriptions")} />
          <DashboardMetric icon={<CalendarIcon aria-hidden="true" />} label="Próximo pagamento" value={isLoading ? "..." : nextPayment ? formatShortDate(nextPayment.renewal_date) : "--"} meta={nextPayment?.name ?? "nenhum cadastrado"} tone="blue" onClick={() => onTabChange("calendar")} />
          <DashboardMetric icon={<BellIcon aria-hidden="true" />} label="Alertas" value={isLoading ? "..." : String(notificationCount)} meta={notificationCount === 1 ? "pendente" : "pendentes"} tone="pink" onClick={onOpenNotifications} />
          <DashboardMetric icon={<CheckCircledIcon aria-hidden="true" />} label="Média mensal" value={isLoading ? "..." : formatCurrency(averageMonthly)} meta="por assinatura" tone="green" onClick={() => onTabChange("subscriptions")} />
        </div>
      </section>

      <section className="dashboard-list-card">
        <div className="dashboard-section-title-row">
          <div>
            <span className="dashboard-eyebrow">Agenda financeira</span>
            <h2>Próximos pagamentos</h2>
          </div>
          <button className="dashboard-circle-button" type="button" aria-label="Adicionar assinatura" onClick={onAddSubscription}>
            <PlusIcon aria-hidden="true" />
          </button>
        </div>
        {error ? <DashboardDataMessage message={error} onRetry={refresh} /> : isLoading ? <DashboardLoadingState /> : subscriptions.length > 0 ? subscriptions.slice(0, 3).map((subscription, index) => (
          <DashboardListItem
            key={subscription.id}
            name={subscription.name}
            detail={`${formatAgendaDate(subscription.renewal_date)} · ${formatFrequency(subscription.frequency)}`}
            value={formatCurrency(subscription.value)}
            tone={subscriptionTone(index)}
            onClick={() => onSubscriptionClick(subscription)}
          />
        )) : <DashboardEmptyState onOpenSubscriptions={() => onTabChange("subscriptions")} />}
      </section>

    </>
  );
}

function DashboardMetric({
  icon,
  label,
  value,
  meta,
  tone,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  meta: string;
  tone: "violet" | "blue" | "pink" | "green";
  onClick: () => void;
}) {
  return (
    <button className="dashboard-metric-card" type="button" data-tone={tone} onClick={onClick}>
      <span className="dashboard-metric-icon">{icon}</span>
      <span className="dashboard-metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="dashboard-metric-meta">{meta}</span>
    </button>
  );
}

function DashboardListItem({ name, detail, value, tone, onClick }: {
  name: string;
  detail: string;
  value: string;
  tone: "red" | "green" | "orange";
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="dashboard-list-avatar" data-tone={tone}>{name.slice(0, 1)}</span>
      <span className="dashboard-list-copy">
        <strong>{name}</strong>
        <small>{detail}</small>
      </span>
      <span className="dashboard-list-value">{value}</span>
      <ChevronRightIcon aria-hidden="true" />
    </>
  );

  return onClick ? (
    <button className="dashboard-list-item" type="button" onClick={onClick} aria-label={`Abrir ${name}`}>
      {content}
    </button>
  ) : (
    <div className="dashboard-list-item">{content}</div>
  );
}

function DashboardLoadingState() {
  return <p className="dashboard-data-state">Carregando suas assinaturas...</p>;
}

function DashboardEmptyState({ onOpenSubscriptions }: { onOpenSubscriptions: () => void }) {
  return (
    <div className="dashboard-data-state">
      <strong>Nenhuma assinatura cadastrada</strong>
      <span>Adicione sua primeira assinatura para acompanhar os próximos pagamentos.</span>
      <button className="dashboard-inline-button" type="button" onClick={onOpenSubscriptions}>Abrir assinaturas</button>
    </div>
  );
}

function DashboardDataMessage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="dashboard-data-state dashboard-data-error">
      <strong>{message}</strong>
      <button className="dashboard-inline-button" type="button" onClick={onRetry}>Tentar novamente</button>
    </div>
  );
}

function DashboardCalendar({
  subscriptions,
  isLoading,
  error,
  refresh,
  onSubscriptionClick,
}: {
  subscriptions: MobileSubscription[];
  isLoading: boolean;
  error: string;
  refresh: () => void;
  onSubscriptionClick: (subscription: MobileSubscription) => void;
}) {
  const today = new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const initializedFromData = useRef(false);

  useEffect(() => {
    if (initializedFromData.current || isLoading || subscriptions.length === 0) return;
    const firstPaymentDate = asCalendarDate(subscriptions[0].renewal_date);
    if (!firstPaymentDate) return;

    setSelectedDate(firstPaymentDate);
    setVisibleMonth(new Date(firstPaymentDate.getFullYear(), firstPaymentDate.getMonth(), 1));
    initializedFromData.current = true;
  }, [isLoading, subscriptions]);

  const selectedKey = calendarDateKey(selectedDate);
  const paymentDays = new Set(
    subscriptions
      .map((subscription) => asCalendarDate(subscription.renewal_date))
      .filter((date): date is Date => Boolean(date))
      .map(calendarDateKey),
  );
  const paymentsOnSelectedDate = subscriptions.filter((subscription) => subscription.renewal_date.slice(0, 10) === selectedKey);
  const days = calendarDaysForMonth(visibleMonth);

  const moveMonth = (offset: number) => {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    setVisibleMonth(nextMonth);
    setSelectedDate(nextMonth);
  };

  const selectToday = () => {
    const nextToday = new Date();
    setVisibleMonth(new Date(nextToday.getFullYear(), nextToday.getMonth(), 1));
    setSelectedDate(nextToday);
  };

  return (
    <section className="dashboard-calendar" aria-label="Calendário de pagamentos">
      <div className="dashboard-calendar-header">
        <button className="dashboard-calendar-nav" type="button" aria-label="Mês anterior" onClick={() => moveMonth(-1)}>‹</button>
        <div>
          <strong>{calendarMonthTitle(visibleMonth)}</strong>
          <button className="dashboard-calendar-today" type="button" onClick={selectToday}>Hoje</button>
        </div>
        <button className="dashboard-calendar-nav" type="button" aria-label="Próximo mês" onClick={() => moveMonth(1)}>›</button>
      </div>

      <div className="dashboard-calendar-weekdays" aria-hidden="true">
        {calendarWeekdays.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
      </div>

      <div className="dashboard-calendar-grid">
        {days.map((day, index) => {
          if (!day) return <span className="dashboard-calendar-empty-day" key={`empty-${index}`} aria-hidden="true" />;
          const dayKey = calendarDateKey(day);
          const hasPayment = paymentDays.has(dayKey);
          const isSelected = dayKey === selectedKey;
          const isToday = dayKey === calendarDateKey(today);

          return (
            <button
              className="dashboard-calendar-day"
              key={dayKey}
              type="button"
              data-payment={hasPayment}
              data-selected={isSelected}
              data-today={isToday}
              aria-label={`${day.getDate()} de ${day.toLocaleDateString("pt-BR", { month: "long" })}${hasPayment ? ", há pagamento" : ""}`}
              onClick={() => setSelectedDate(day)}
            >
              {day.getDate()}
              {hasPayment && <span className="dashboard-calendar-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className="dashboard-calendar-details">
        <div className="dashboard-calendar-details-heading">
          <div>
            <span className="dashboard-eyebrow">Pagamentos do dia</span>
            <h2>{calendarSelectedDateTitle(selectedDate)}</h2>
          </div>
          {!isLoading && <span className="dashboard-calendar-count">{paymentsOnSelectedDate.length}</span>}
        </div>

        {error ? <DashboardDataMessage message={error} onRetry={refresh} /> : isLoading ? <DashboardLoadingState /> : paymentsOnSelectedDate.length > 0 ? (
          <div className="dashboard-calendar-payment-list">
            {paymentsOnSelectedDate.map((subscription, index) => (
              <DashboardListItem
                key={subscription.id}
                name={subscription.name}
                detail={`${formatCurrency(subscription.value)} · ${formatFrequency(subscription.frequency)}`}
                value={formatAgendaDate(subscription.renewal_date)}
                tone={subscriptionTone(index)}
                onClick={() => onSubscriptionClick(subscription)}
              />
            ))}
          </div>
        ) : (
          <p className="dashboard-calendar-empty-state">Nenhum pagamento nesta data.</p>
        )}
      </div>
    </section>
  );
}

function DashboardModule({
  tab,
  subscriptions,
  isLoading,
  error,
  refresh,
  userName,
  userEmail,
  profile,
  plan,
  onAddSubscription,
  onSubscriptionClick,
  onEditProfile,
  onSignOut,
  isSigningOut,
}: {
  tab: Exclude<DashboardTab, "overview">;
  subscriptions: MobileSubscription[];
  isLoading: boolean;
  error: string;
  refresh: () => void;
  userName: string;
  userEmail: string;
  profile: MobileProfile | null;
  plan: MobilePlan | null;
  onAddSubscription: () => void;
  onSubscriptionClick: (subscription: MobileSubscription) => void;
  onEditProfile: () => void;
  onSignOut?: () => void;
  isSigningOut?: boolean;
}) {
  const moduleCopy = {
    subscriptions: {
      eyebrow: "Seu catálogo",
      title: "Assinaturas",
      description: "Tudo o que se renova, em um só lugar.",
      action: "Nova assinatura",
    },
    calendar: {
      eyebrow: "Agenda financeira",
      title: "Calendário",
      description: "Veja suas cobranças organizadas por dia.",
      action: "Nova assinatura",
    },
    profile: {
      eyebrow: "Sua conta",
      title: "Perfil",
      description: "Preferências, plano e segurança.",
      action: "Editar perfil",
    },
  }[tab];

  return (
    <motion.div className="dashboard-module" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <span className="dashboard-eyebrow">{moduleCopy.eyebrow}</span>
      <h1>{moduleCopy.title}</h1>
      <p className="dashboard-module-description">{moduleCopy.description}</p>
      {tab === "profile" ? (
        <button className="dashboard-secondary-button dashboard-profile-edit-button" type="button" onClick={onEditProfile}>
          Editar perfil
        </button>
      ) : (
        <button className="dashboard-primary-button" type="button" onClick={onAddSubscription}>
          <PlusIcon aria-hidden="true" />
          {moduleCopy.action}
        </button>
      )}

      {tab === "calendar" ? (
        <DashboardCalendar
          subscriptions={subscriptions}
          isLoading={isLoading}
          error={error}
          refresh={refresh}
          onSubscriptionClick={onSubscriptionClick}
        />
      ) : (
      <section className="dashboard-list-card dashboard-module-card">
        {tab === "profile" ? (
          <>
            <div className="dashboard-profile-avatar">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" draggable={false} /> : <PersonIcon aria-hidden="true" />}
            </div>
            <h2>{userName}</h2>
            <p>{profile?.email || userEmail || "E-mail não informado"}</p>
            <div className="dashboard-profile-row"><span>Plano atual</span><strong>{formatPlan(plan)}</strong></div>
            <div className="dashboard-profile-row"><span>Validade</span><strong>{formatPlanDetail(plan)}</strong></div>
            <div className="dashboard-profile-row"><span>Telefone</span><strong>{profile?.phone_number || "Não informado"}</strong></div>
            <button className="dashboard-danger-button" type="button" onClick={onSignOut} disabled={isSigningOut}>
              {isSigningOut ? "Saindo..." : "Sair da conta"}
            </button>
          </>
        ) : tab === "subscriptions" ? (
          error ? <DashboardDataMessage message={error} onRetry={refresh} /> : isLoading ? <DashboardLoadingState /> : subscriptions.length > 0 ? subscriptions.map((subscription, index) => (
            <DashboardListItem
              key={subscription.id}
              name={subscription.name}
              detail={`Renova em ${formatAgendaDate(subscription.renewal_date)} · ${formatFrequency(subscription.frequency)}`}
              value={formatCurrency(subscription.value)}
              tone={subscriptionTone(index)}
              onClick={() => onSubscriptionClick(subscription)}
            />
          )) : <DashboardEmptyState onOpenSubscriptions={onAddSubscription} />
        ) : (
          error ? <DashboardDataMessage message={error} onRetry={refresh} /> : isLoading ? <DashboardLoadingState /> : subscriptions.length > 0 ? subscriptions.map((subscription, index) => {
            const days = daysUntil(subscription.renewal_date);
            const timing = days < 0 ? "atrasado" : days === 0 ? "hoje" : `em ${days} dias`;
            return (
              <DashboardListItem
                key={subscription.id}
                name={subscription.name}
                detail={`${formatAgendaDate(subscription.renewal_date)} · ${timing}`}
                value={formatCurrency(subscription.value)}
                tone={subscriptionTone(index)}
                onClick={() => onSubscriptionClick(subscription)}
              />
            );
          }) : <DashboardEmptyState onOpenSubscriptions={onAddSubscription} />
        )}
      </section>
      )}
    </motion.div>
  );
}

function splashScreen(): FlowScreen {
  return { id: "splash", render: (flow) => <SplashScreen flow={flow} /> };
}

function welcomeScreen(): FlowScreen {
  return { id: "welcome", render: (flow) => <WelcomeScreen flow={flow} /> };
}

function loginScreen(): FlowScreen {
  return { id: "login", render: (flow) => <LoginScreen flow={flow} /> };
}

function signupScreen(): FlowScreen {
  return { id: "signup", render: (flow) => <SignupScreen flow={flow} /> };
}

function resetScreen(initialEmail: string): FlowScreen {
  return { id: "reset", render: (flow) => <ResetScreen flow={flow} initialEmail={initialEmail} /> };
}

function dashboardScreen(): FlowScreen {
  return { id: "dashboard", render: (flow) => <DashboardScreen flow={flow} /> };
}

export default function Prototype() {
  const { ready, hasSession } = useInitialAuthState();

  if (!ready) {
    return (
      <div className="splash-screen" data-testid="session-loading-screen" aria-label="Carregando sessão">
        <motion.img
          src={logoAsset}
          alt="MaisCtrl"
          className="splash-logo"
          draggable={false}
          initial={{ opacity: 0, scale: 0.78 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    );
  }

  return <FlowStack key={hasSession ? "authenticated" : "public"} initial={hasSession ? dashboardScreen() : splashScreen()} />;
}
