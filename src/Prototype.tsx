import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import * as Dialog from "@radix-ui/react-dialog";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { App } from "@capacitor/app";
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
  Cross2Icon,
  DownloadIcon,
  DotsHorizontalIcon,
  EnvelopeClosedIcon,
  EyeClosedIcon,
  EyeOpenIcon,
  LockClosedIcon,
  PersonIcon,
  PlusIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import {
  FlowStack,
  BottomSheet,
  Carousel,
  KeyboardInput,
  MobileScroll,
  useScreenPortal,
  type FlowControls,
  type FlowScreen,
  useMobileDevice,
  useKeyboard,
  useKeyboardInsets,
} from "./mobile";
import { supabase, supabaseConfigured } from "./lib/supabase";
import { getAuthRedirectUrl } from "./lib/authRedirect";

const backgroundAsset = "/assets/auth-panels.png";
const logoAsset = "/assets/logo.svg";
const androidReleaseApiUrl = "https://api.github.com/repos/yeMorGx/maisctrlapp/releases/tags/android-latest";
const fallbackAppVersion = import.meta.env.VITE_APP_VERSION || "0.1.53";
const updateGracePeriodHours = 6;
const updateGracePeriodMs = updateGracePeriodHours * 60 * 60 * 1000;
const updateGraceStorageKey = "maisctrl-update-grace-v1";

type AppUpdateRelease = {
  version: string;
  build: number;
  releasedAt: string;
  downloadUrl: string;
  changes: string[];
};

type AppUpdateState = {
  status: "checking" | "current" | "available" | "offline" | "error";
  installedVersion: string;
  release: AppUpdateRelease | null;
};

function normalizeVersion(value: string) {
  const match = value.match(/\d+(?:\.\d+){2}/);
  return match ? match[0] : "";
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersion(left).split(".").map(Number);
  const rightParts = normalizeVersion(right).split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function getInstalledAppVersion() {
  if (!Capacitor.isNativePlatform()) return fallbackAppVersion;
  try {
    const appInfo = await App.getInfo();
    return normalizeVersion(appInfo.version) || fallbackAppVersion;
  } catch {
    return fallbackAppVersion;
  }
}

function useAppUpdate() {
  const [state, setState] = useState<AppUpdateState>({ status: "checking", installedVersion: fallbackAppVersion, release: null });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const checkForUpdate = async () => {
      const installedVersion = await getInstalledAppVersion();
      if (!active) return;

      if (Capacitor.getPlatform() === "ios") {
        setState({ status: "current", installedVersion, release: null });
        return;
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setState({ status: "offline", installedVersion, release: null });
        return;
      }

      try {
        const response = await fetch(androidReleaseApiUrl, {
          cache: "no-store",
          headers: { Accept: "application/vnd.github+json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Release check failed with ${response.status}`);
        const payload = await response.json() as {
          name?: unknown;
          body?: unknown;
          published_at?: unknown;
          assets?: Array<{ name?: unknown; browser_download_url?: unknown }>;
        };
        const apkAsset = payload.assets?.find((asset) => asset.name === "maisctrl.apk");
        const manifestAsset = payload.assets?.find((asset) => asset.name === "android-update.json");
        let manifest: { version?: unknown; releasedAt?: unknown; downloadUrl?: unknown; changes?: unknown } | null = null;
        if (typeof manifestAsset?.browser_download_url === "string" && manifestAsset.browser_download_url.startsWith("https://")) {
          try {
            const manifestResponse = await fetch(manifestAsset.browser_download_url, { cache: "no-store", signal: controller.signal });
            if (manifestResponse.ok) manifest = await manifestResponse.json();
          } catch {
            // The API metadata below remains enough to show the update when the asset is unavailable.
          }
        }
        const version = normalizeVersion(String(manifest?.version ?? `${String(payload.name ?? "")} ${String(payload.body ?? "")}`));
        const manifestDownloadUrl = typeof manifest?.downloadUrl === "string" && manifest.downloadUrl.startsWith("https://") ? manifest.downloadUrl : "";
        const downloadUrl = manifestDownloadUrl || (typeof apkAsset?.browser_download_url === "string" && apkAsset.browser_download_url.startsWith("https://")
          ? apkAsset.browser_download_url
          : "");
        if (!version || !downloadUrl) throw new Error("Release metadata is incomplete");

        const manifestChanges = Array.isArray(manifest?.changes) ? manifest.changes.filter((change): change is string => typeof change === "string") : [];
        const fallbackChanges = String(payload.body ?? "")
          .split(/\r?\n/)
          .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
          .filter((line) => line && !/^versão:|^build:/i.test(line));

        const release: AppUpdateRelease = {
          version,
          build: Number(version.split(".")[2]) || 0,
          releasedAt: String(manifest?.releasedAt ?? payload.published_at ?? ""),
          downloadUrl,
          changes: (manifestChanges.length > 0 ? manifestChanges : fallbackChanges).slice(0, 2),
        };

        if (!active) return;
        setState({
          status: compareVersions(release.version, installedVersion) > 0 ? "available" : "current",
          installedVersion,
          release,
        });
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (!(error instanceof Error && error.message === "Release metadata is incomplete")) {
          console.warn("Não foi possível verificar atualizações do MaisCtrl.", error);
        }
        setState({ status: "error", installedVersion, release: null });
      }
    };

    void checkForUpdate();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return state;
}

type UpdateGrace = {
  version: string;
  startedAt: number;
  expiresAt: number;
};

function readUpdateGrace(): UpdateGrace | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(updateGraceStorageKey) ?? "null") as Partial<UpdateGrace> | null;
    if (!parsed || typeof parsed.version !== "string" || typeof parsed.startedAt !== "number" || typeof parsed.expiresAt !== "number") return null;
    return parsed as UpdateGrace;
  } catch {
    return null;
  }
}

function writeUpdateGrace(grace: UpdateGrace) {
  try {
    window.localStorage.setItem(updateGraceStorageKey, JSON.stringify(grace));
  } catch {
    // A sessão sem storage continua com a janela atual em memória.
  }
}

function useUpdateGracePeriod(release: AppUpdateRelease | null) {
  const [grace, setGrace] = useState<UpdateGrace | null>(() => readUpdateGrace());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!release) return;
    const stored = readUpdateGrace();
    if (!stored || stored.version !== release.version) {
      const startedAt = Date.now();
      const nextGrace = { version: release.version, startedAt, expiresAt: startedAt + updateGracePeriodMs };
      writeUpdateGrace(nextGrace);
      setGrace(nextGrace);
      setNow(startedAt);
      return;
    }
    setGrace(stored);
    setNow(Date.now());
  }, [release]);

  useEffect(() => {
    if (!release || !grace) return;
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [grace, release]);

  const remainingMs = grace ? Math.max(0, grace.expiresAt - now) : updateGracePeriodMs;
  return { remainingMs, isLocked: Boolean(release && grace && remainingMs <= 0) };
}

function formatUpdateRemaining(remainingMs: number) {
  if (remainingMs <= 0) return "prazo encerrado";
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours > 0) return `${hours}h${restMinutes > 0 ? ` ${restMinutes}min` : ""}`;
  return `${minutes}min`;
}

function AppUpdateTrigger({ locked, onClick }: { locked: boolean; onClick: () => void }) {
  return (
    <button
      className="dashboard-update-trigger"
      type="button"
      data-locked={locked ? "true" : "false"}
      data-testid="app-update-trigger"
      aria-label={locked ? "Atualização obrigatória" : "Abrir atualização disponível"}
      onClick={onClick}
    >
      <UpdateIcon aria-hidden="true" />
      {locked ? <span aria-hidden="true">!</span> : null}
    </button>
  );
}

function AppUpdateModal({ release, open, locked, remainingMs, onOpenChange }: { release: AppUpdateRelease | null; open: boolean; locked: boolean; remainingMs: number; onOpenChange: (open: boolean) => void }) {
  const { screenRef } = useScreenPortal();
  if (!release) return null;
  const releaseSummary = release.changes[0] || "Correções e melhorias para deixar seu controle financeiro mais estável.";
  const modalTitle = locked ? "Atualização obrigatória" : "Nova versão disponível";

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!locked) onOpenChange(nextOpen); }}>
      <Dialog.Portal container={screenRef.current ?? undefined} forceMount>
        {open ? (
          <>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="app-update-modal-overlay" data-testid="app-update-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div className="app-update-modal" data-testid="app-update-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="app-update-modal-icon"><DownloadIcon aria-hidden="true" /></div>
                <div className="app-update-modal-heading">
                  <Dialog.Title className="app-update-modal-title">{modalTitle}</Dialog.Title>
                  <Dialog.Description className="app-update-modal-description">MaisCtrl {release.version} já está disponível.</Dialog.Description>
                </div>
                {!locked ? <Dialog.Close asChild><button className="app-update-modal-close" type="button" aria-label="Fechar atualização"><Cross2Icon aria-hidden="true" /></button></Dialog.Close> : null}
                <p className="app-update-modal-copy">{releaseSummary}</p>
                <div className="app-update-modal-window" data-locked={locked ? "true" : "false"}>
                  <span>{locked ? "Acesso bloqueado" : "Você pode continuar por"}</span>
                  <strong>{locked ? "Atualize para continuar" : formatUpdateRemaining(remainingMs)}</strong>
                </div>
                <a className="app-update-modal-action" href={release.downloadUrl} download="maisctrl.apk" aria-label={`Baixar MaisCtrl ${release.version}`}>
                  <DownloadIcon aria-hidden="true" />
                  Baixar atualização
                </a>
                <small className="app-update-modal-note">Baixe e instale a APK mais recente. Ao abrir a nova versão, o acesso será liberado automaticamente.</small>
              </motion.div>
            </Dialog.Content>
          </>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function useNativeSystemBars(style: SystemBarsStyle) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void SystemBars.setStyle({ style }).catch(() => undefined);
  }, [style]);
}

function authErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.toLowerCase().includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (message.toLowerCase().includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (message.toLowerCase().includes("user already registered")) return "Este e-mail já possui uma conta.";
  if (message.toLowerCase().includes("password should be at least")) return "A senha precisa ter pelo menos 8 caracteres.";
  return message || "Não foi possível concluir agora. Tente novamente.";
}

function passwordRules(password: string) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

function isStrongPassword(password: string) {
  return Object.values(passwordRules(password)).every(Boolean);
}

function useInitialAuthState() {
  const [ready, setReady] = useState(!supabaseConfigured);
  const [hasSession, setHasSession] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    const authClient = supabase;
    if (!authClient) return;

    let active = true;
    const authSubscription = authClient.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);
      setHasSession(Boolean(session));
      setReady(true);
    });

    const applyAuthCallback = async (url: string) => {
      if (!url.startsWith("maisctrl://auth/callback") || !active) return;

      const callbackUrl = new URL(url);
      const params = new URLSearchParams(callbackUrl.search);
      if (callbackUrl.hash) {
        new URLSearchParams(callbackUrl.hash.slice(1)).forEach((value, key) => params.set(key, value));
      }

      const errorDescription = params.get("error_description") || params.get("error");
      if (errorDescription) {
        console.warn("A confirmação do e-mail não foi concluída.", errorDescription);
        return;
      }

      const isRecovery = params.get("type") === "recovery";
      if (isRecovery) setIsPasswordRecovery(true);

      try {
        const code = params.get("code");
        if (code) {
          const { error } = await authClient.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          if (!accessToken || !refreshToken) return;

          const { error } = await authClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        }

        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (error) {
        if (isRecovery) setIsPasswordRecovery(false);
        console.warn("Não foi possível concluir a confirmação do e-mail no app.", error);
      }
    };

    let cancelled = false;
    let urlListener: Awaited<ReturnType<typeof App.addListener>> | undefined;

    const setupDeepLinkListener = async () => {
      if (!Capacitor.isNativePlatform()) return;

      const listener = await App.addListener("appUrlOpen", ({ url }) => {
        void applyAuthCallback(url);
      });

      if (cancelled) {
        await listener.remove();
        return;
      }

      urlListener = listener;
      const launchUrl = await App.getLaunchUrl();
      if (!cancelled && launchUrl?.url) await applyAuthCallback(launchUrl.url);
    };

    void setupDeepLinkListener();

    authClient.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.warn("Não foi possível restaurar a sessão mobile.", error);
      setHasSession(Boolean(data.session));
      setReady(true);
    });

    return () => {
      active = false;
      cancelled = true;
      authSubscription.data.subscription.unsubscribe();
      void urlListener?.remove();
    };
  }, []);

  return { ready, hasSession, isPasswordRecovery };
}

function BrandLockup() {
  return (
    <div className="brand-lockup" aria-label="MaisCtrl">
      <img src={logoAsset} alt="" className="brand-mark" draggable={false} />
      <span>MaisCtrl</span>
    </div>
  );
}

function DashboardSpaceBadge({ onClick }: { onClick: () => void }) {
  return (
    <button className="dashboard-space-badge" type="button" aria-label="Abrir espaço +Couple" onClick={onClick}>
      <span className="dashboard-space-badge-mark">
        <img src={logoAsset} alt="" draggable={false} />
      </span>
      <span className="dashboard-space-badge-copy">
        <strong>MaisCtrl</strong>
        <small>Seu espaço</small>
      </span>
      <ChevronRightIcon aria-hidden="true" />
    </button>
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

function PasswordRules({ password }: { password: string }) {
  const rules = passwordRules(password);
  const items = [
    [rules.length, "8 caracteres"],
    [rules.uppercase, "uma letra maiúscula"],
    [rules.lowercase, "uma letra minúscula"],
    [rules.number, "um número"],
    [rules.symbol, "um símbolo"],
  ] as const;

  return (
    <ul className="password-rules" aria-label="Requisitos da senha">
      {items.map(([valid, label]) => (
        <li key={label} data-valid={valid ? "true" : "false"}>
          <CheckCircledIcon aria-hidden="true" />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}

function SplashScreen({ flow }: { flow: FlowControls }) {
  const hasAdvanced = useRef(false);
  useNativeSystemBars(SystemBarsStyle.Dark);

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
  useNativeSystemBars(SystemBarsStyle.Dark);

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

      <motion.section
        className="auth-panel auth-panel-welcome auth-panel-welcome-fixed"
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
  fitViewport = false,
  children,
}: {
  className: string;
  fitViewport?: boolean;
  children: ReactNode;
}) {
  const { device } = useMobileDevice();

  return (
    <main
      className={className}
      style={{ minHeight: fitViewport ? "100%" : Capacitor.isNativePlatform() ? "100dvh" : device.geometry.screen.height }}
    >
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
  useNativeSystemBars(SystemBarsStyle.Dark);
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
  const { keyboardHeight, isKeyboardVisible } = useKeyboardInsets();
  useNativeSystemBars(SystemBarsStyle.Dark);
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
  const canAdvance = signupStep === 0 ? Boolean(name.trim()) : signupStep === 1 ? emailIsValid : isStrongPassword(password);

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    event.target.value = "";
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setAuthError("Escolha uma imagem JPG, PNG ou WEBP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAuthError("A foto precisa ter no máximo 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(typeof reader.result === "string" ? reader.result : "");
      setAuthError("");
    };
    reader.onerror = () => setAuthError("Não foi possível ler essa foto.");
    reader.readAsDataURL(file);
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
        emailRedirectTo: getAuthRedirectUrl("/dashboard"),
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

      <section
        className="auth-signup-viewport"
        data-keyboard-visible={isKeyboardVisible ? "true" : "false"}
        style={{ "--keyboard-height": `${keyboardHeight}px` } as CSSProperties}
      >
        <AuthScrollContent className="auth-scroll-content auth-scroll-content-form" fitViewport>
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
                  <>
                    <PasswordField id="signup-password" label="Crie uma senha" value={password} onChange={setPassword} />
                    <PasswordRules password={password} />
                  </>
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
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAvatarChange}
                    />
                    <div className="signup-photo-copy">
                      <strong>{avatarPreview ? "Foto escolhida" : "Sua foto de perfil"}</strong>
                      <span>{avatarPreview ? "Você pode trocar quando quiser." : "JPG, PNG ou WEBP · até 5 MB · opcional"}</span>
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
                  <button className="pill-button" type="submit" disabled={!name || !emailIsValid || !isStrongPassword(password) || isSubmitting}>
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
      </section>
    </div>
  );
}

function ResetScreen({ flow, initialEmail }: { flow: FlowControls; initialEmail: string }) {
  const keyboard = useKeyboard();
  useNativeSystemBars(SystemBarsStyle.Dark);
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
      redirectTo: getAuthRedirectUrl("/auth"),
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

function PasswordRecoveryScreen({ flow }: { flow: FlowControls }) {
  const keyboard = useKeyboard();
  useNativeSystemBars(SystemBarsStyle.Dark);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    keyboard.hide();
    setAuthError("");

    if (!isStrongPassword(password)) {
      setAuthError("Escolha uma senha que atenda a todos os requisitos.");
      return;
    }

    if (password !== confirmation) {
      setAuthError("As senhas não conferem.");
      return;
    }

    if (!supabase) {
      setAuthError("A conexão com o Supabase ainda não foi configurada.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      const message = error.message.toLowerCase();
      setAuthError(
        message.includes("session") || message.includes("expired") || message.includes("invalid")
          ? "Este link expirou ou já foi usado. Solicite um novo link de recuperação."
          : authErrorMessage(error),
      );
      setIsSubmitting(false);
      return;
    }

    setSubmitted(true);
    setIsSubmitting(false);
  };

  return (
    <div className="auth-screen" data-testid="password-recovery-screen">
      <AuthBackground />
      <AuthTopbar flow={flow} onBack={() => flow.replace(loginScreen())} />

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
              <h1>Crie uma senha nova.</h1>
              <p>Escolha uma senha segura para voltar a usar sua conta.</p>
            </div>

            {authError && <p className="auth-error" role="alert">{authError}</p>}

            {submitted ? (
              <AuthSuccess
                message="Sua senha foi atualizada com sucesso."
                onReset={() => setSubmitted(false)}
                onContinue={() => flow.replace(dashboardScreen())}
                continueLabel="Continuar para o app"
              />
            ) : (
              <form className="auth-form" onSubmit={submit}>
                <PasswordField id="recovery-password" label="Nova senha" value={password} onChange={setPassword} />
                <PasswordRules password={password} />
                <PasswordField id="recovery-password-confirmation" label="Confirme a nova senha" value={confirmation} onChange={setConfirmation} />
                <button className="pill-button" type="submit" disabled={!isStrongPassword(password) || password !== confirmation || isSubmitting}>
                  {isSubmitting ? "Salvando..." : "Salvar nova senha"}
                </button>
              </form>
            )}
          </motion.section>
        </AuthScrollContent>
      </MobileScroll>
    </div>
  );
}

type DashboardTab =
  | "overview"
  | "finances"
  | "subscriptions"
  | "calendar"
  | "profile"
  | "cards"
  | "financings"
  | "loans"
  | "goals"
  | "tasks"
  | "reports"
  | "ai"
  | "premium"
  | "couple"
  | "share"
  | "more";

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

type LocalTransactionType = "income" | "expense";

type LocalTransaction = {
  id: string;
  type: LocalTransactionType;
  description: string;
  category: string;
  value: number;
  date: string;
  sourceId?: string;
};

type LocalCard = {
  id: string;
  name: string;
  last4: string;
  limit: number;
  used: number;
  closingDay: number;
  dueDay: number;
};

type LocalDebtKind = "loan" | "financing" | "debt";

type LocalDebt = {
  id: string;
  title: string;
  kind: LocalDebtKind;
  total: number;
  paid: number;
  monthlyPayment: number;
  dueDate: string;
};

type LocalGoal = {
  id: string;
  title: string;
  target: number;
  current: number;
  deadline: string;
};

type LocalTask = {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
};

type LocalSharedItem = {
  id: string;
  title: string;
  value: number;
  split: "50/50" | "custom";
  status: "pending" | "paid";
};

const localFinanceStorageKey = "maisctrl-local-finance-v1";
const localCardsStorageKey = "maisctrl-local-cards-v1";
const localDebtsStorageKey = "maisctrl-local-debts-v1";
const localGoalsStorageKey = "maisctrl-local-goals-v1";
const localTasksStorageKey = "maisctrl-local-tasks-v1";
const localSharedStorageKey = "maisctrl-local-shared-v1";

function localId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type OfxImportResult = {
  institution: string;
  transactions: Array<Omit<LocalTransaction, "id">>;
  skipped: number;
};

function decodeOfxText(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function ofxTagValue(source: string, tag: string) {
  const match = source.match(new RegExp(`<${tag}\\b[^>]*>([^<\\r\\n]*)`, "i"));
  return decodeOfxText(match?.[1]?.trim() ?? "");
}

function ofxDateValue(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function ofxAmountValue(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

async function readOfxFile(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const header = new TextDecoder("windows-1252").decode(bytes.slice(0, 512));
  const decoder = /CHARSET:\s*1252/i.test(header) ? new TextDecoder("windows-1252") : new TextDecoder("utf-8");
  return decoder.decode(buffer);
}

function parseOfxTransactions(source: string): OfxImportResult {
  if (!/<OFX\b/i.test(source)) throw new Error("Escolha um arquivo OFX ou QFX válido.");

  const transactionStarts = Array.from(source.matchAll(/<STMTTRN\b[^>]*>/gi));
  const endMarkers = ["</BANKTRANLIST>", "</CCSTMTRS>", "</BANKMSGSRSV1>", "</CREDITCARDMSGSRSV1>"];
  const blocks = transactionStarts.map((match, index) => {
    const start = match.index ?? 0;
    const nextStart = transactionStarts[index + 1]?.index ?? source.length;
    const end = Math.min(nextStart, ...endMarkers.map((marker) => {
      const markerIndex = source.indexOf(marker, start);
      return markerIndex >= 0 ? markerIndex : source.length;
    }));
    return source.slice(start, end);
  });
  if (blocks.length === 0) throw new Error("Não encontrei lançamentos nesse arquivo.");

  const accountId = ofxTagValue(source, "ACCTID") || "conta";
  const institution = ofxTagValue(source, "ORG") || "Banco importado";
  const seenSourceIds = new Set<string>();
  let skipped = 0;
  const transactions = blocks.flatMap((block) => {
    const date = ofxDateValue(ofxTagValue(block, "DTPOSTED"));
    const rawAmount = ofxTagValue(block, "TRNAMT");
    const amount = ofxAmountValue(rawAmount);
    const description = ofxTagValue(block, "MEMO") || ofxTagValue(block, "NAME") || "Lançamento importado";
    const fitId = ofxTagValue(block, "FITID");
    if (!date || amount === null || amount === 0) {
      skipped += 1;
      return [];
    }

    // Alguns emissores repetem o FITID em itens diferentes do mesmo extrato.
    // O restante da identidade mantém esses lançamentos distintos sem perder a
    // proteção contra uma nova importação do mesmo arquivo.
    const sourceId = `${accountId}:${fitId || "sem-fitid"}:${date}:${rawAmount}:${description}`;
    if (seenSourceIds.has(sourceId)) {
      skipped += 1;
      return [];
    }
    seenSourceIds.add(sourceId);
    return [{
      type: amount > 0 ? "income" : "expense",
      description,
      category: "Importado",
      value: Math.abs(amount),
      date,
      sourceId,
    } satisfies Omit<LocalTransaction, "id">];
  });

  if (transactions.length === 0) throw new Error("Não encontrei lançamentos válidos nesse arquivo.");
  return { institution, transactions: transactions.sort((left, right) => right.date.localeCompare(left.date)), skipped };
}

function readLocalTransactions() {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(localFinanceStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is LocalTransaction => {
      if (!item || typeof item !== "object") return false;
      const transaction = item as Partial<LocalTransaction>;
      return (
        typeof transaction.id === "string" &&
        (transaction.type === "income" || transaction.type === "expense") &&
        typeof transaction.description === "string" &&
        typeof transaction.category === "string" &&
        typeof transaction.value === "number" &&
        Number.isFinite(transaction.value) &&
        typeof transaction.date === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeLocalTransactions(transactions: LocalTransaction[]) {
  try {
    window.localStorage.setItem(localFinanceStorageKey, JSON.stringify(transactions));
  } catch {
    // O estado continua disponível durante a sessão, mesmo quando o storage está indisponível.
  }
}

function useLocalFinance() {
  const [transactions, setTransactions] = useState<LocalTransaction[]>(readLocalTransactions);

  useEffect(() => {
    writeLocalTransactions(transactions);
  }, [transactions]);

  const addTransaction = (transaction: Omit<LocalTransaction, "id">) => {
    setTransactions((current) => [{ ...transaction, id: localId() }, ...current]);
  };

  const addTransactions = (newTransactions: Array<Omit<LocalTransaction, "id">>) => {
    setTransactions((current) => {
      const existingSourceIds = new Set(current.map((transaction) => transaction.sourceId).filter((sourceId): sourceId is string => Boolean(sourceId)));
      const freshTransactions = newTransactions.filter((transaction) => !transaction.sourceId || !existingSourceIds.has(transaction.sourceId));
      return [...freshTransactions.map((transaction) => ({ ...transaction, id: localId() })), ...current];
    });
  };

  const removeTransaction = (id: string) => {
    setTransactions((current) => current.filter((transaction) => transaction.id !== id));
  };

  const updateTransaction = (id: string, transaction: Omit<LocalTransaction, "id">) => {
    setTransactions((current) => current.map((item) => item.id === id ? { ...transaction, id } : item));
  };

  return { transactions, addTransaction, addTransactions, updateTransaction, removeTransaction };
}

function readLocalCollection<T>(storageKey: string): T[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function useLocalCollection<T extends { id: string }>(storageKey: string) {
  const [items, setItems] = useState<T[]>(() => readLocalCollection<T>(storageKey));

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // O estado segue disponível na sessão quando o storage não está disponível.
    }
  }, [items, storageKey]);

  const addItem = (item: Omit<T, "id">) => setItems((current) => [{ ...item, id: localId() } as T, ...current]);
  const updateItem = (id: string, item: Omit<T, "id">) => setItems((current) => current.map((entry) => entry.id === id ? { ...item, id } as T : entry));
  const removeItem = (id: string) => setItems((current) => current.filter((entry) => entry.id !== id));

  return { items, addItem, updateItem, removeItem, setItems };
}

function useLocalCards() {
  return useLocalCollection<LocalCard>(localCardsStorageKey);
}

function useLocalDebts() {
  return useLocalCollection<LocalDebt>(localDebtsStorageKey);
}

function useLocalGoals() {
  return useLocalCollection<LocalGoal>(localGoalsStorageKey);
}

function useLocalTasks() {
  return useLocalCollection<LocalTask>(localTasksStorageKey);
}

function useLocalSharedItems() {
  return useLocalCollection<LocalSharedItem>(localSharedStorageKey);
}

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

function formatPaymentMethod(method: string) {
  return ({
    credit: "cartão de crédito",
    debit: "cartão de débito",
    pix: "Pix",
    boleto: "boleto",
  } as Record<string, string>)[method] ?? method;
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
const nativePushTokenStorageKey = "maisctrl-native-push-token";
const pushNotificationChannelId = "maisctrl-reminders";

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

type PendingPushRegistration = {
  userId: string;
  resolve: (saved: boolean) => void;
  timeoutId: number;
};

let pushListenerUserId = "";
let pushListeners: Array<{ remove: () => Promise<void> }> = [];
let pendingPushRegistration: PendingPushRegistration | null = null;

function finishPushRegistration(userId: string, saved: boolean) {
  if (pendingPushRegistration?.userId !== userId) return;

  const pending = pendingPushRegistration;
  pendingPushRegistration = null;
  window.clearTimeout(pending.timeoutId);
  pending.resolve(saved);
}

async function ensurePushNotificationChannel() {
  if (Capacitor.getPlatform() !== "android") return;

  await PushNotifications.createChannel({
    id: pushNotificationChannelId,
    name: "Lembretes de cobranças",
    description: "Avisos sobre próximos vencimentos e fim de testes.",
    importance: 4,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: "#7c3aed",
  });
}

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

  if (error) return false;
  localStorage.setItem(nativePushTokenStorageKey, token);
  return true;
}

async function preparePushListeners(userId: string) {
  if (!Capacitor.isNativePlatform() || !supabase) return;
  if (pushListenerUserId === userId && pushListeners.length > 0) return;

  await Promise.all(pushListeners.map((listener) => listener.remove()));
  pushListeners = [];

  const registrationListener = await PushNotifications.addListener("registration", ({ value }) => {
    void savePushToken(userId, value)
      .then((saved) => finishPushRegistration(userId, saved))
      .catch(() => finishPushRegistration(userId, false));
  });
  const registrationErrorListener = await PushNotifications.addListener("registrationError", (error) => {
    console.warn("Não foi possível registrar o push do MaisCtrl.", error);
    finishPushRegistration(userId, false);
  });

  pushListeners = [registrationListener, registrationErrorListener];
  pushListenerUserId = userId;
}

async function syncPushRegistration(userId: string, requestPermission = false): Promise<PushStatus> {
  if (!Capacitor.isNativePlatform() || !supabase) return "unavailable";

  try {
    await preparePushListeners(userId);
    await ensurePushNotificationChannel();
    let permission = await PushNotifications.checkPermissions();
    if (requestPermission && permission.receive !== "granted") {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== "granted") return "denied";

    const tokenSaved = new Promise<boolean>((resolve) => {
      if (pendingPushRegistration) {
        window.clearTimeout(pendingPushRegistration.timeoutId);
        pendingPushRegistration.resolve(false);
      }

      pendingPushRegistration = {
        userId,
        resolve,
        timeoutId: window.setTimeout(() => finishPushRegistration(userId, false), 15_000),
      };
    });
    await PushNotifications.register();
    return (await tokenSaved) ? "enabled" : "error";
  } catch {
    if (pendingPushRegistration?.userId === userId) {
      const pending = pendingPushRegistration;
      pendingPushRegistration = null;
      window.clearTimeout(pending.timeoutId);
      pending.resolve(false);
    }
    return "error";
  }
}

async function requestPushNotificationTest(): Promise<{ ok: boolean; message: string }> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, message: "O teste está disponível somente no app instalado." };
  }
  if (!supabase) {
    return { ok: false, message: "A conexão com o servidor ainda não foi configurada." };
  }

  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (sessionError || !userId) {
      return { ok: false, message: "Entre na sua conta para testar o push." };
    }

    const registrationStatus = await syncPushRegistration(userId, true);
    if (registrationStatus !== "enabled") {
      return { ok: false, message: "Não foi possível registrar este aparelho. Verifique a permissão de notificações." };
    }

    const { data: response, error } = await supabase.functions.invoke("send-push-notifications", {
      body: { mode: "test" },
    });
    if (error) throw error;

    const result = response as { devices?: number; sent?: number } | null;
    if (!result || Number(result.sent ?? 0) < 1) {
      return result?.devices === 0
        ? { ok: false, message: "Este aparelho ainda não foi encontrado no servidor. Tente ativar as notificações novamente." }
        : { ok: false, message: "O servidor recebeu o teste, mas não confirmou a entrega ao aparelho." };
    }

    return { ok: true, message: "Teste enviado. Bloqueie ou feche o app e aguarde alguns segundos pela notificação." };
  } catch {
    return { ok: false, message: "Não foi possível enviar o teste agora. Verifique a conexão e tente novamente." };
  }
}

async function clearPushRegistration(userId: string) {
  if (!supabase || !Capacitor.isNativePlatform()) return;

  const token = localStorage.getItem(nativePushTokenStorageKey);
  const deleteQuery = supabase.from("push_devices").delete().eq("user_id", userId);
  await (token ? deleteQuery.eq("token", token) : deleteQuery);
  localStorage.removeItem(nativePushTokenStorageKey);
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

function displayFirstName(value: string) {
  const firstName = value.trim().split(/\s+/)[0];
  if (!firstName) return "você";
  return firstName.charAt(0).toLocaleUpperCase("pt-BR") + firstName.slice(1).toLocaleLowerCase("pt-BR");
}

function subscriptionDisplayName(user: { email?: string; user_metadata?: Record<string, unknown> } | null) {
  const fullName = user?.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) return displayFirstName(fullName);

  const emailName = user?.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!emailName) return "você";
  return displayFirstName(emailName);
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

type SubscriptionStep = 1 | 2 | 3;

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
  const [step, setStep] = useState<SubscriptionStep>(1);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [paymentMethod, setPaymentMethod] = useState("credit");
  const [renewalDate, setRenewalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [trialEndDate, setTrialEndDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setStep(1);
    setName("");
    setValue("");
    setFrequency("monthly");
    setPaymentMethod("credit");
    setRenewalDate(new Date().toISOString().slice(0, 10));
    setTrialEndDate("");
    setError("");
    setIsSaving(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      keyboard.hide();
      reset();
    }
    onOpenChange(nextOpen);
  };

  const validateStep = () => {
    if (step === 1) {
      const parsedValue = Number(value.replace(",", "."));
      if (!name.trim() || !Number.isFinite(parsedValue) || parsedValue <= 0) {
        setError("Informe o nome e um valor válido para continuar.");
        return false;
      }
    }

    if (step === 3 && !renewalDate) {
      setError("Informe a próxima renovação para continuar.");
      return false;
    }

    setError("");
    return true;
  };

  const goBack = () => {
    keyboard.hide();
    setError("");
    if (step === 1) {
      handleOpenChange(false);
      return;
    }
    setStep((current) => (current - 1) as SubscriptionStep);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (step < 3) {
      if (!validateStep()) return;
      keyboard.hide();
      setStep((current) => (current + 1) as SubscriptionStep);
      return;
    }

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
      description={step === 1 ? "Comece pelo serviço e pelo valor." : step === 2 ? "Escolha como essa cobrança acontece." : "Confira os dados antes de salvar."}
      snap={0.72}
      scrollable={false}
    >
      <form className="subscription-form subscription-add-form" data-testid="subscription-add-flow" onSubmit={submit}>
        <div className="subscription-flow-progress" aria-label={`Etapa ${step} de 3`}>
          <div className="subscription-flow-progress-bars" aria-hidden="true">
            {[1, 2, 3].map((item) => <span key={item} data-active={item <= step ? "true" : "false"} />)}
          </div>
          <div className="subscription-flow-progress-copy">
            <span>Nova assinatura</span>
            <strong>Etapa {step} de 3</strong>
          </div>
        </div>

        {step === 1 ? (
          <div className="subscription-flow-step" data-step="1">
            <div className="subscription-flow-step-heading">
              <span className="dashboard-eyebrow">O que você acompanha?</span>
              <strong>Identifique a cobrança</strong>
            </div>
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
          </div>
        ) : step === 2 ? (
          <div className="subscription-flow-step" data-step="2">
            <div className="subscription-flow-step-heading">
              <span className="dashboard-eyebrow">Como ela funciona?</span>
              <strong>Defina a cobrança</strong>
            </div>
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
          </div>
        ) : (
          <div className="subscription-flow-step" data-step="3">
            <div className="subscription-flow-step-heading">
              <span className="dashboard-eyebrow">Quando ela volta?</span>
              <strong>Defina as próximas datas</strong>
            </div>
            <MobileDateField id="subscription-renewal" label="Próxima renovação" value={renewalDate} onChange={(nextValue) => {
              setRenewalDate(nextValue);
              setError("");
            }} />
            <MobileDateField id="subscription-trial-end" label={<>Fim do teste <small>(opcional)</small></>} value={trialEndDate} onChange={(nextValue) => {
              setTrialEndDate(nextValue);
              setError("");
            }} />
            <div className="subscription-flow-review" aria-label="Resumo da assinatura">
              <div><span>Serviço</span><strong>{name || "—"}</strong></div>
              <div><span>Valor</span><strong>{value ? `R$ ${value}` : "—"}</strong></div>
              <div><span>Cobrança</span><strong>{frequency === "monthly" ? "Mensal" : frequency === "annual" ? "Anual" : frequency === "weekly" ? "Semanal" : frequency === "daily" ? "Diária" : "Trimestral"} · {paymentMethod === "credit" ? "Crédito" : paymentMethod === "debit" ? "Débito" : paymentMethod === "pix" ? "PIX" : "Boleto"}</strong></div>
            </div>
          </div>
        )}

        {error && <p className="auth-error subscription-form-error" role="alert">{error}</p>}

        <div className="subscription-flow-actions">
          <button className="dashboard-secondary-button" type="button" onClick={goBack} disabled={isSaving}>
            {step === 1 ? "Cancelar" : "Voltar"}
          </button>
          <button className="dashboard-primary-button subscription-submit" type="submit" disabled={isSaving}>
            {step === 3 ? (isSaving ? "Salvando..." : "Cadastrar assinatura") : "Próximo"}
          </button>
        </div>
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
      scrollable={mode !== "edit"}
    >
      {mode === "view" ? (
        <div className="subscription-sheet-content">
          <div className="subscription-sheet-identity">
            <SubscriptionAvatar name={subscription.name} tone={subscriptionTone(subscription.name.length)} />
            <div className="subscription-sheet-identity-copy">
              <span className="dashboard-eyebrow">Cobrança recorrente</span>
              <strong>{subscription.name}</strong>
              <span className="subscription-sheet-next-date">Próxima cobrança em {formatAgendaDate(subscription.renewal_date)}</span>
            </div>
            <div className="subscription-sheet-price">
              <strong>{formatCurrency(subscription.value)}</strong>
              <span>por cobrança</span>
            </div>
          </div>

          <div className="subscription-sheet-summary">
            <div className="subscription-sheet-summary-featured">
              <span>Próxima renovação</span>
              <strong>{formatAgendaDate(subscription.renewal_date)}</strong>
              <small>Seu próximo ciclo começa nesta data.</small>
            </div>
            <div><span>Frequência</span><strong>{formatFrequency(subscription.frequency)}</strong></div>
            <div><span>Pagamento</span><strong>{formatPaymentMethod(subscription.payment_method)}</strong></div>
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

          <MobileDateField id="edit-subscription-renewal" label="Próxima renovação" value={renewalDate} onChange={setRenewalDate} />

          <MobileDateField id="edit-subscription-trial-end" label={<>Fim do teste <small>(opcional)</small></>} value={trialEndDate} onChange={setTrialEndDate} />

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
      scrollable={false}
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

function localNumber(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPremiumPlan(plan: MobilePlan | null) {
  return plan?.plan === "premium" || plan?.plan === "lifetime";
}

function PremiumBadge() {
  return <span className="dashboard-premium-badge">Premium</span>;
}

function formatDateFieldValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function parseDateFieldValue(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return "";
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateFieldTyping(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function MobileDateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
}) {
  const keyboard = useKeyboard();
  const datePickerRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(() => formatDateFieldValue(value));

  useEffect(() => {
    setDraft(formatDateFieldValue(value));
  }, [value]);

  const handleDraftChange = (nextValue: string) => {
    const nextDraft = formatDateFieldTyping(nextValue);
    setDraft(nextDraft);
    if (!nextDraft) {
      onChange("");
      return;
    }
    const parsed = parseDateFieldValue(nextDraft);
    if (parsed) onChange(parsed);
  };

  return (
    <label className="mobile-field dashboard-tool-field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="input-shell date-input-shell">
        <KeyboardInput
          id={id}
          type="text"
          inputMode="numeric"
          value={draft}
          placeholder="dd/mm/aaaa"
          autoComplete="off"
          onChange={(event) => handleDraftChange(event.target.value)}
        />
        <button
          className="date-picker-button"
          type="button"
          aria-label={`Abrir calendário para ${typeof label === "string" ? label : "esta data"}`}
          onClick={() => {
            keyboard.hide();
            const nativeInput = datePickerRef.current;
            if (!nativeInput) return;
            if (nativeInput.showPicker) nativeInput.showPicker();
            else nativeInput.focus();
          }}
        >
          <CalendarIcon aria-hidden="true" />
        </button>
        <KeyboardInput
          ref={datePickerRef}
          className="date-picker-native"
          type="date"
          lang="pt-BR"
          tabIndex={-1}
          aria-hidden="true"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

function LocalDataField({
  id,
  label,
  value,
  placeholder,
  type = "text",
  inputMode,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  inputMode?: "text" | "decimal" | "numeric" | "email" | "tel";
  onChange: (value: string) => void;
}) {
  return (
    <label className="mobile-field dashboard-tool-field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="input-shell">
        <KeyboardInput id={id} type={type} inputMode={inputMode} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  );
}

function DashboardMoreSheet({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (tab: DashboardTab) => void }) {
  const items: Array<{ tab: DashboardTab; title: string; description: string; icon: ReactNode; tone: "violet" | "blue" | "orange" | "pink" | "green" | "dark"; premium?: boolean }> = [
    { tab: "cards", title: "Cartões e faturas", description: "Limites, faturas e vencimentos", icon: <CardStackIcon aria-hidden="true" />, tone: "violet" },
    { tab: "financings", title: "Parcelas e financiamentos", description: "Acompanhe compromissos longos", icon: <CalendarIcon aria-hidden="true" />, tone: "blue" },
    { tab: "loans", title: "Empréstimos e dívidas", description: "Saldo, parcelas e progresso", icon: <ArrowLeftIcon aria-hidden="true" />, tone: "orange" },
    { tab: "goals", title: "Metas e sonhos", description: "Planeje o que importa", icon: <CheckCircledIcon aria-hidden="true" />, tone: "green" },
    { tab: "tasks", title: "Tarefas e lembretes", description: "Não deixe uma conta passar", icon: <BellIcon aria-hidden="true" />, tone: "pink" },
    { tab: "reports", title: "Relatórios", description: "Resumo e exportações", icon: <BarChartIcon aria-hidden="true" />, tone: "dark", premium: true },
    { tab: "ai", title: "Ctrl AI", description: "Pergunte sobre seu dinheiro", icon: <DotsHorizontalIcon aria-hidden="true" />, tone: "violet" },
    { tab: "couple", title: "+Couple", description: "Compartilhe tudo a dois", icon: <PersonIcon aria-hidden="true" />, tone: "pink", premium: true },
    { tab: "share", title: "+Share", description: "Divida assinaturas e pagamentos", icon: <CardStackIcon aria-hidden="true" />, tone: "blue", premium: true },
    { tab: "premium", title: "Plano Premium", description: "Mais espaço para organizar", icon: <PlusIcon aria-hidden="true" />, tone: "dark" },
  ];

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Mais controles" description="Tudo o que você pode adicionar ao seu espaço." snap={0.82} scrollable>
      <div className="more-sheet-content">
        {items.map((item) => <button key={item.tab} className={`more-sheet-item${item.premium ? " more-sheet-item-premium" : ""}`} data-tone={item.tone} type="button" onClick={() => onSelect(item.tab)}><span className="more-sheet-icon">{item.icon}</span><span className="more-sheet-copy"><strong>{item.title}</strong><small>{item.description}</small></span>{item.premium ? <PremiumBadge /> : null}<ChevronRightIcon aria-hidden="true" /></button>)}
      </div>
    </BottomSheet>
  );
}

type PaymentCardBrand = "nubank" | "inter" | "itau" | "bradesco" | "default";

function paymentCardBrand(name: string): PaymentCardBrand {
  const normalizedName = normalizeSubscriptionName(name);
  if (normalizedName.includes("nubank")) return "nubank";
  if (normalizedName === "inter" || normalizedName.includes("banco inter")) return "inter";
  if (normalizedName.includes("itau") || normalizedName.includes("itaú")) return "itau";
  if (normalizedName.includes("bradesco")) return "bradesco";
  return "default";
}

function PaymentCardVisual({ card, onRemove }: { card: LocalCard; onRemove: (id: string) => void }) {
  const available = Math.max(0, card.limit - card.used);
  const usage = card.limit > 0 ? Math.min(100, (card.used / card.limit) * 100) : 0;

  return (
    <article className="payment-card" data-brand={paymentCardBrand(card.name)} data-testid="payment-card">
      <div className="payment-card-face">
        <div className="payment-card-header">
          <span>MaisCtrl crédito</span>
          <CardStackIcon aria-hidden="true" />
        </div>
        <div className="payment-card-brand">
          <SubscriptionAvatar name={card.name} tone="orange" loading="eager" />
          <div>
            <strong>{card.name}</strong>
            <small>Cartão de crédito</small>
          </div>
        </div>
        <strong className="payment-card-number">•••• {card.last4 || "0000"}</strong>
        <div className="payment-card-footer">
          <span>Fecha dia {card.closingDay}</span>
          <span>Vence dia {card.dueDay}</span>
        </div>
      </div>
      <div className="payment-card-details" aria-label={`Resumo do cartão ${card.name}`}>
        <div>
          <span>Fatura</span>
          <strong>{formatCurrency(card.used)}</strong>
        </div>
        <div>
          <span>Disponível</span>
          <strong>{formatCurrency(available)}</strong>
        </div>
        <div>
          <span>Limite</span>
          <strong>{formatCurrency(card.limit)}</strong>
        </div>
      </div>
      <div className="payment-card-usage">
        <div>
          <span>Limite usado</span>
          <strong>{Math.round(usage)}%</strong>
        </div>
        <span className="payment-card-usage-track" aria-hidden="true">
          <span style={{ width: `${usage}%` }} />
        </span>
        <button type="button" className="dashboard-inline-delete" aria-label={`Excluir cartão ${card.name}`} onClick={() => onRemove(card.id)}>Excluir cartão</button>
      </div>
    </article>
  );
}

function DashboardCards({ plan, onOpenPremium }: { plan: MobilePlan | null; onOpenPremium: () => void }) {
  const keyboard = useKeyboard();
  const { items: cards, addItem, removeItem } = useLocalCards();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [last4, setLast4] = useState("");
  const [limit, setLimit] = useState("");
  const [used, setUsed] = useState("");
  const [closingDay, setClosingDay] = useState("10");
  const [dueDay, setDueDay] = useState("17");
  const premium = isPremiumPlan(plan);
  const openSheet = () => { keyboard.hide(); setMessage(""); setIsSheetOpen(true); };
  const handleSheetChange = (nextOpen: boolean) => {
    if (!nextOpen) keyboard.hide();
    setIsSheetOpen(nextOpen);
  };
  const saveCard = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || localNumber(limit) <= 0) { setMessage("Informe o nome e um limite válido."); return; }
    if (!premium && cards.length >= 1) { setMessage("O plano Free permite 1 cartão. Desbloqueie cartões ilimitados no Premium."); return; }
    addItem({ name: name.trim(), last4: last4.replace(/\D/g, "").slice(-4), limit: localNumber(limit), used: Math.min(localNumber(used), localNumber(limit)), closingDay: Math.max(1, Math.min(31, Number(closingDay) || 10)), dueDay: Math.max(1, Math.min(31, Number(dueDay) || 17)) });
    setName(""); setLast4(""); setLimit(""); setUsed(""); keyboard.hide(); setIsSheetOpen(false);
  };

  return <>
    {cards.length > 0 ? <section className="payment-card-section" aria-labelledby="payment-card-section-title"><div className="dashboard-section-title-row payment-card-section-heading"><div><span className="dashboard-eyebrow">Visão do crédito</span><h2 id="payment-card-section-title">Seus cartões</h2></div>{cards.length > 1 ? <span className="payment-card-swipe-hint">Deslize <ChevronRightIcon aria-hidden="true" /></span> : null}</div><Carousel ariaLabel="Seus cartões em destaque" className="payment-card-carousel" contentClassName="payment-card-carousel-track">{cards.map((card) => <PaymentCardVisual key={card.id} card={card} onRemove={removeItem} />)}</Carousel></section> : null}
    <section className="dashboard-tool-summary" data-tone="blue"><div><span className="dashboard-eyebrow">Crédito organizado</span><strong>{cards.length} {cards.length === 1 ? "cartão" : "cartões"}</strong></div><CardStackIcon aria-hidden="true" /><p>{cards.length === 0 ? "Cadastre um cartão para acompanhar limite e fatura." : "A fatura fica visível junto com as próximas contas."}</p></section>
    <button className="dashboard-primary-button" type="button" onClick={openSheet}><PlusIcon aria-hidden="true" />Adicionar cartão</button>
    {!premium && cards.length >= 1 ? <button className="dashboard-upgrade-banner" type="button" onClick={onOpenPremium}><PremiumBadge /><span>Tenha cartões ilimitados no Premium.</span><ChevronRightIcon aria-hidden="true" /></button> : null}
    <section className="dashboard-list-card dashboard-tool-list payment-card-list"><div className="dashboard-section-title-row"><div><span className="dashboard-eyebrow">Detalhes e ações</span><h2>{cards.length > 0 ? "Todos os cartões" : "Seus cartões"}</h2></div><span className="dashboard-calendar-count">{cards.length}</span></div>{cards.length > 0 ? cards.map((card) => { const available = Math.max(0, card.limit - card.used); const usage = card.limit > 0 ? Math.min(100, (card.used / card.limit) * 100) : 0; return <div className="dashboard-tool-row" key={card.id}><span className="dashboard-tool-avatar"><CardStackIcon aria-hidden="true" /></span><span className="dashboard-list-copy"><strong>{card.name}{card.last4 ? ` ···· ${card.last4}` : ""}</strong><small>Fecha dia {card.closingDay} · vence dia {card.dueDay}</small><span className="dashboard-progress-track"><span style={{ width: `${usage}%` }} /></span></span><span className="dashboard-tool-row-side"><strong>{formatCurrency(available)}</strong><small>disponível</small><button type="button" className="dashboard-inline-delete" aria-label={`Excluir cartão ${card.name}`} onClick={() => removeItem(card.id)}>Excluir</button></span></div>; }) : <div className="dashboard-data-state"><strong>Nenhum cartão cadastrado</strong><span>Comece com um cartão para acompanhar sua fatura.</span></div>}</section>
    <BottomSheet open={isSheetOpen} onOpenChange={handleSheetChange} title="Adicionar cartão" description="Os dados ficam neste aparelho nesta primeira versão." snap={0.76} scrollable={false}><form className="dashboard-tool-form" onSubmit={saveCard}><LocalDataField id="card-name" label="Nome do cartão" placeholder="Ex.: Nubank" value={name} onChange={setName} /><LocalDataField id="card-last4" label="Últimos 4 números" placeholder="0000" value={last4} onChange={setLast4} inputMode="numeric" /><div className="subscription-form-grid"><LocalDataField id="card-limit" label="Limite total" placeholder="5.000,00" value={limit} onChange={setLimit} inputMode="decimal" /><LocalDataField id="card-used" label="Fatura atual" placeholder="0,00" value={used} onChange={setUsed} inputMode="decimal" /></div><div className="subscription-form-grid"><LocalDataField id="card-closing" label="Fecha dia" placeholder="10" value={closingDay} onChange={setClosingDay} inputMode="numeric" /><LocalDataField id="card-due" label="Vence dia" placeholder="17" value={dueDay} onChange={setDueDay} inputMode="numeric" /></div>{message ? <p className="auth-error subscription-form-error" role="alert">{message}</p> : null}<button className="dashboard-primary-button subscription-submit" type="submit">Salvar cartão</button></form></BottomSheet>
  </>;
}

function DashboardCredit({ mode, plan, onOpenPremium }: { mode: "financings" | "loans"; plan: MobilePlan | null; onOpenPremium: () => void }) {
  const keyboard = useKeyboard();
  const { items, addItem, removeItem, setItems } = useLocalDebts();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<LocalDebtKind>(mode === "financings" ? "financing" : "loan");
  const [total, setTotal] = useState("");
  const [paid, setPaid] = useState("");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const visibleItems = items.filter((item) => mode === "financings" ? item.kind === "financing" : item.kind !== "financing");
  const totalOpen = visibleItems.reduce((sum, item) => sum + Math.max(0, item.total - item.paid), 0);
  const openSheet = () => { keyboard.hide(); setMessage(""); setIsSheetOpen(true); };
  const handleSheetChange = (nextOpen: boolean) => {
    if (!nextOpen) keyboard.hide();
    setIsSheetOpen(nextOpen);
  };
  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!title.trim() || localNumber(total) <= 0) { setMessage("Informe uma descrição e um valor total válido."); return; } addItem({ title: title.trim(), kind, total: localNumber(total), paid: Math.min(localNumber(paid), localNumber(total)), monthlyPayment: localNumber(monthlyPayment), dueDate }); setTitle(""); setTotal(""); setPaid(""); setMonthlyPayment(""); keyboard.hide(); setIsSheetOpen(false); };
  const registerPayment = (id: string) => setItems((current) => current.map((item) => item.id === id ? { ...item, paid: Math.min(item.total, item.paid + Math.max(item.monthlyPayment, 0)) } : item));
  return <>
    <section className="dashboard-tool-summary" data-tone="orange"><div><span className="dashboard-eyebrow">Compromissos em aberto</span><strong>{formatCurrency(totalOpen)}</strong></div><ArrowLeftIcon aria-hidden="true" /><p>{visibleItems.length === 0 ? "Cadastre seu primeiro compromisso para acompanhar a evolução." : `${visibleItems.length} registro${visibleItems.length === 1 ? "" : "s"} acompanhado${visibleItems.length === 1 ? "" : "s"}.`}</p></section>
    <button className="dashboard-primary-button" type="button" onClick={openSheet}><PlusIcon aria-hidden="true" />Adicionar {mode === "financings" ? "financiamento" : "empréstimo"}</button>
    <section className="dashboard-list-card dashboard-tool-list"><div className="dashboard-section-title-row"><div><span className="dashboard-eyebrow">Acompanhamento</span><h2>{mode === "financings" ? "Financiamentos" : "Empréstimos e dívidas"}</h2></div><span className="dashboard-calendar-count">{visibleItems.length}</span></div>{visibleItems.length > 0 ? visibleItems.map((item) => { const progress = item.total > 0 ? Math.min(100, (item.paid / item.total) * 100) : 0; return <div className="dashboard-tool-row" key={item.id}><span className="dashboard-tool-avatar"><CalendarIcon aria-hidden="true" /></span><span className="dashboard-list-copy"><strong>{item.title}</strong><small>{item.kind === "debt" ? "Dívida" : item.kind === "loan" ? "Empréstimo" : "Financiamento"} · vence {formatShortDate(item.dueDate)}</small><span className="dashboard-progress-track"><span style={{ width: `${progress}%` }} /></span></span><span className="dashboard-tool-row-side"><strong>{formatCurrency(Math.max(0, item.total - item.paid))}</strong><small>{Math.round(progress)}% pago</small><button type="button" className="dashboard-inline-action" onClick={() => registerPayment(item.id)} disabled={item.paid >= item.total}>Registrar parcela</button><button type="button" className="dashboard-inline-delete" aria-label={`Excluir ${item.title}`} onClick={() => removeItem(item.id)}>Excluir</button></span></div>; }) : <div className="dashboard-data-state"><strong>Sem registros por enquanto</strong><span>Você poderá acompanhar valor pago e saldo restante.</span></div>}</section>
    {!isPremiumPlan(plan) ? <button className="dashboard-upgrade-banner" type="button" onClick={onOpenPremium}><PremiumBadge /><span>Desbloqueie históricos e limites maiores no Premium.</span><ChevronRightIcon aria-hidden="true" /></button> : null}
    <BottomSheet open={isSheetOpen} onOpenChange={handleSheetChange} title={mode === "financings" ? "Adicionar financiamento" : "Adicionar empréstimo"} description="Acompanhe o saldo de forma simples." snap={0.76} scrollable={false}><form className="dashboard-tool-form" onSubmit={save}><LocalDataField id={`${mode}-title`} label="Descrição" placeholder={mode === "financings" ? "Ex.: Carro" : "Ex.: Empréstimo pessoal"} value={title} onChange={setTitle} /><label className="mobile-field dashboard-tool-field" htmlFor={`${mode}-kind`}><span className="field-label">Tipo</span><select id={`${mode}-kind`} value={kind} onChange={(event) => setKind(event.target.value as LocalDebtKind)}><option value="loan">Empréstimo</option><option value="debt">Dívida</option><option value="financing">Financiamento</option></select></label><div className="subscription-form-grid"><LocalDataField id={`${mode}-total`} label="Valor total" placeholder="10.000,00" value={total} onChange={setTotal} inputMode="decimal" /><LocalDataField id={`${mode}-paid`} label="Já pago" placeholder="0,00" value={paid} onChange={setPaid} inputMode="decimal" /></div><div className="subscription-form-grid"><LocalDataField id={`${mode}-monthly`} label="Parcela" placeholder="500,00" value={monthlyPayment} onChange={setMonthlyPayment} inputMode="decimal" /><MobileDateField id={`${mode}-due`} label="Próximo vencimento" value={dueDate} onChange={setDueDate} /></div>{message ? <p className="auth-error subscription-form-error" role="alert">{message}</p> : null}<button className="dashboard-primary-button subscription-submit" type="submit">Salvar registro</button></form></BottomSheet>
  </>;
}

function DashboardGoals({ plan, onOpenPremium }: { plan: MobilePlan | null; onOpenPremium: () => void }) {
  const keyboard = useKeyboard();
  const { items: goals, addItem, removeItem } = useLocalGoals();
  const [isSheetOpen, setIsSheetOpen] = useState(false); const [message, setMessage] = useState(""); const [title, setTitle] = useState(""); const [target, setTarget] = useState(""); const [current, setCurrent] = useState(""); const [deadline, setDeadline] = useState("");
  const openSheet = () => { keyboard.hide(); setMessage(""); setIsSheetOpen(true); };
  const handleSheetChange = (nextOpen: boolean) => { if (!nextOpen) keyboard.hide(); setIsSheetOpen(nextOpen); };
  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!title.trim() || localNumber(target) <= 0) { setMessage("Informe um nome e um valor de meta válido."); return; } addItem({ title: title.trim(), target: localNumber(target), current: Math.min(localNumber(current), localNumber(target)), deadline }); setTitle(""); setTarget(""); setCurrent(""); setDeadline(""); keyboard.hide(); setIsSheetOpen(false); };
  return <><section className="dashboard-tool-summary" data-tone="violet"><div><span className="dashboard-eyebrow">Planos que importam</span><strong>{goals.length} {goals.length === 1 ? "meta" : "metas"}</strong></div><CheckCircledIcon aria-hidden="true" /><p>Transforme objetivos em passos visíveis, com prazo e progresso.</p></section><button className="dashboard-primary-button" type="button" onClick={openSheet}><PlusIcon aria-hidden="true" />Nova meta</button><section className="dashboard-list-card dashboard-tool-list"><div className="dashboard-section-title-row"><div><span className="dashboard-eyebrow">Seus objetivos</span><h2>Metas e sonhos</h2></div><span className="dashboard-calendar-count">{goals.length}</span></div>{goals.length > 0 ? goals.map((goal) => { const progress = goal.target > 0 ? Math.min(100, (goal.current / goal.target) * 100) : 0; return <div className="dashboard-goal-card" key={goal.id}><div className="dashboard-goal-heading"><strong>{goal.title}</strong><span>{Math.round(progress)}%</span></div><div className="dashboard-progress-track"><span style={{ width: `${progress}%` }} /></div><div className="dashboard-goal-meta"><span>{formatCurrency(goal.current)} de {formatCurrency(goal.target)}</span><button className="dashboard-inline-delete" type="button" onClick={() => removeItem(goal.id)}>Excluir</button></div>{goal.deadline ? <small>Prazo: {formatAgendaDate(goal.deadline)}</small> : null}</div>; }) : <div className="dashboard-data-state"><strong>Nenhuma meta criada</strong><span>Uma reserva, uma viagem ou qualquer sonho começa aqui.</span></div>}</section>{!isPremiumPlan(plan) ? <button className="dashboard-upgrade-banner" type="button" onClick={onOpenPremium}><PremiumBadge /><span>Crie metas ilimitadas e acompanhe relatórios no Premium.</span><ChevronRightIcon aria-hidden="true" /></button> : null}<BottomSheet open={isSheetOpen} onOpenChange={handleSheetChange} title="Criar meta" description="Defina o que você quer alcançar." snap={0.68} scrollable={false}><form className="dashboard-tool-form" onSubmit={save}><LocalDataField id="goal-title" label="Nome da meta" placeholder="Ex.: Reserva de emergência" value={title} onChange={setTitle} /><div className="subscription-form-grid"><LocalDataField id="goal-target" label="Valor alvo" placeholder="20.000,00" value={target} onChange={setTarget} inputMode="decimal" /><LocalDataField id="goal-current" label="Já guardado" placeholder="0,00" value={current} onChange={setCurrent} inputMode="decimal" /></div><MobileDateField id="goal-deadline" label="Prazo (opcional)" value={deadline} onChange={setDeadline} />{message ? <p className="auth-error subscription-form-error" role="alert">{message}</p> : null}<button className="dashboard-primary-button subscription-submit" type="submit">Salvar meta</button></form></BottomSheet></>;
}

function DashboardTasks() {
  const keyboard = useKeyboard(); const { items: tasks, addItem, removeItem, setItems } = useLocalTasks(); const [isSheetOpen, setIsSheetOpen] = useState(false); const [title, setTitle] = useState(""); const [dueDate, setDueDate] = useState(""); const [message, setMessage] = useState("");
  const openSheet = () => { keyboard.hide(); setMessage(""); setIsSheetOpen(true); }; const handleSheetChange = (nextOpen: boolean) => { if (!nextOpen) keyboard.hide(); setIsSheetOpen(nextOpen); }; const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!title.trim()) { setMessage("Informe o que precisa ser feito."); return; } addItem({ title: title.trim(), dueDate, done: false }); setTitle(""); setDueDate(""); keyboard.hide(); setIsSheetOpen(false); };
  return <><section className="dashboard-tool-summary" data-tone="pink"><div><span className="dashboard-eyebrow">Próximos passos</span><strong>{tasks.filter((task) => !task.done).length} pendentes</strong></div><BellIcon aria-hidden="true" /><p>Crie lembretes para vencimentos, revisões e decisões financeiras.</p></section><button className="dashboard-primary-button" type="button" onClick={openSheet}><PlusIcon aria-hidden="true" />Nova tarefa</button><section className="dashboard-list-card dashboard-tool-list"><div className="dashboard-section-title-row"><div><span className="dashboard-eyebrow">Organização</span><h2>Tarefas e lembretes</h2></div><span className="dashboard-calendar-count">{tasks.length}</span></div>{tasks.length > 0 ? tasks.map((task) => <div className="dashboard-task-row" key={task.id} data-done={task.done ? "true" : "false"}><button type="button" className="dashboard-task-check" aria-label={`${task.done ? "Reabrir" : "Concluir"} tarefa ${task.title}`} onClick={() => setItems((current) => current.map((entry) => entry.id === task.id ? { ...entry, done: !entry.done } : entry))}>{task.done ? <CheckCircledIcon aria-hidden="true" /> : <span />}</button><span className="dashboard-list-copy"><strong>{task.title}</strong><small>{task.dueDate ? `Até ${formatAgendaDate(task.dueDate)}` : "Sem prazo definido"}</small></span><button className="dashboard-inline-delete" type="button" onClick={() => removeItem(task.id)}>Excluir</button></div>) : <div className="dashboard-data-state"><strong>Nenhuma tarefa pendente</strong><span>Adicione um lembrete para cuidar do próximo passo.</span></div>}</section><BottomSheet open={isSheetOpen} onOpenChange={handleSheetChange} title="Nova tarefa" description="Um lembrete simples para sua rotina." snap={0.58} scrollable={false}><form className="dashboard-tool-form" onSubmit={save}><LocalDataField id="task-title" label="Tarefa" placeholder="Ex.: Conferir fatura" value={title} onChange={setTitle} /><MobileDateField id="task-due" label="Prazo (opcional)" value={dueDate} onChange={setDueDate} />{message ? <p className="auth-error subscription-form-error" role="alert">{message}</p> : null}<button className="dashboard-primary-button subscription-submit" type="submit">Salvar tarefa</button></form></BottomSheet></>;
}

function downloadLocalFile(filename: string, content: string, type: string) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.style.display = "none"; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }

function DashboardReports({ subscriptions, plan, onOpenPremium }: { subscriptions: MobileSubscription[]; plan: MobilePlan | null; onOpenPremium: () => void }) {
  const { transactions } = useLocalFinance(); const [exportFeedback, setExportFeedback] = useState(""); const income = transactions.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.value, 0); const expenses = transactions.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.value, 0); const recurring = subscriptions.reduce((sum, entry) => sum + monthlySubscriptionValue(entry), 0); const exportCsv = () => { downloadLocalFile(`maisctrl-relatorio-${new Date().toISOString().slice(0, 10)}.csv`, ["indicador;valor", `entradas;${income.toFixed(2)}`, `saidas;${expenses.toFixed(2)}`, `assinaturas_mensais;${recurring.toFixed(2)}`, `saldo;${(income - expenses).toFixed(2)}`].join("\n"), "text/csv;charset=utf-8"); setExportFeedback("CSV exportado. Confira a pasta de downloads."); };
  return <><section className="dashboard-tool-summary" data-tone="green"><div><span className="dashboard-eyebrow">Leitura do momento</span><strong>{formatCurrency(income - expenses)}</strong></div><BarChartIcon aria-hidden="true" /><p>Resumo criado com seus lançamentos locais e assinaturas sincronizadas.</p></section><div className="dashboard-report-grid"><div><span>Entradas</span><strong>{formatCurrency(income)}</strong></div><div><span>Saídas</span><strong>{formatCurrency(expenses)}</strong></div><div><span>Recorrentes</span><strong>{formatCurrency(recurring)}</strong></div><div><span>Assinaturas</span><strong>{subscriptions.length}</strong></div></div><section className="dashboard-list-card dashboard-report-actions"><div className="dashboard-section-title-row"><div><span className="dashboard-eyebrow">Exportar</span><h2>Leve seus dados</h2></div><PremiumBadge /></div><button className="dashboard-secondary-button" type="button" onClick={exportCsv}>Exportar CSV</button>{exportFeedback ? <p className="dashboard-push-feedback" data-tone="success" role="status">{exportFeedback}</p> : null}<button className="dashboard-secondary-button" type="button" onClick={onOpenPremium} disabled={!isPremiumPlan(plan)}>{isPremiumPlan(plan) ? "Exportar Excel / PDF" : "Excel e PDF no Premium"}</button><p>O CSV funciona offline. Os formatos avançados ficam disponíveis no plano Premium.</p></section></>;
}

function DashboardAI({ plan, onOpenPremium }: { plan: MobilePlan | null; onOpenPremium: () => void }) {
  const keyboard = useKeyboard(); const premium = isPremiumPlan(plan); const [prompt, setPrompt] = useState(""); const [count, setCount] = useState(0); const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([{ role: "assistant", text: "Posso resumir seus lançamentos, encontrar padrões e ajudar a planejar o próximo passo." }]);
  const send = () => { const cleanPrompt = prompt.trim(); if (!cleanPrompt) return; if (!premium && count >= 5) { onOpenPremium(); return; } const lower = cleanPrompt.toLocaleLowerCase("pt-BR"); const answer = lower.includes("econom") || lower.includes("cortar") ? "Comece olhando as maiores saídas do mês e as cobranças recorrentes. O relatório do MaisCtrl ajuda a separar o que é fixo do que pode ser reduzido." : lower.includes("meta") ? "Uma boa meta começa com valor, prazo e um aporte que caiba no mês. Crie uma meta no menu Mais para acompanhar esse progresso." : "Entendi. Para uma resposta completa, conecte seus lançamentos e assinaturas; por enquanto posso orientar com base no que está salvo neste aparelho."; setMessages((current) => [...current, { role: "user", text: cleanPrompt }, { role: "assistant", text: answer }]); setCount((current) => current + 1); setPrompt(""); keyboard.hide(); };
  return <><section className="dashboard-tool-summary" data-tone="violet"><div><span className="dashboard-eyebrow">Seu copiloto</span><strong>Ctrl AI</strong></div><DotsHorizontalIcon aria-hidden="true" /><p>{premium ? "Uso ilimitado no Premium." : `${Math.max(0, 5 - count)} perguntas gratuitas restantes hoje.`}</p></section><section className="dashboard-ai-card"><div className="dashboard-ai-messages">{messages.map((message, index) => <div className="dashboard-ai-message" data-role={message.role} key={`${message.role}-${index}`}><span>{message.role === "assistant" ? "Ctrl AI" : "Você"}</span><p>{message.text}</p></div>)}</div><div className="dashboard-ai-presets"><button type="button" onClick={() => setPrompt("Como posso economizar este mês?")}>Como economizar?</button><button type="button" onClick={() => setPrompt("Me ajude com uma meta")}>Criar uma meta</button></div><div className="dashboard-ai-input"><KeyboardInput aria-label="Pergunte ao Ctrl AI" value={prompt} placeholder="Pergunte ao Ctrl AI" onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); send(); } }} /><button type="button" aria-label="Enviar pergunta" onClick={send} disabled={!prompt.trim()}><ChevronRightIcon aria-hidden="true" /></button></div></section>{!premium ? <button className="dashboard-upgrade-banner" type="button" onClick={onOpenPremium}><PremiumBadge /><span>Use o Ctrl AI sem limite com o Premium.</span><ChevronRightIcon aria-hidden="true" /></button> : null}</>;
}

function DashboardPremium({ plan }: { plan: MobilePlan | null }) {
  const keyboard = useKeyboard(); const [billing, setBilling] = useState<"monthly" | "annual">("annual"); const [isCardFormOpen, setIsCardFormOpen] = useState(false); const [message, setMessage] = useState(""); const [cardName, setCardName] = useState(""); const [cardNumber, setCardNumber] = useState(""); const [cardExpiry, setCardExpiry] = useState(""); const [cardCvv, setCardCvv] = useState(""); const active = isPremiumPlan(plan);
  const handleCardFormChange = (nextOpen: boolean) => { if (!nextOpen) keyboard.hide(); setIsCardFormOpen(nextOpen); };
  const submitCard = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setMessage("A cobrança segura por cartão será ativada assim que o provedor de pagamentos estiver configurado para esta conta. Nenhum dado do cartão foi salvo."); keyboard.hide(); setIsCardFormOpen(false); };
  return <><section className="premium-hero-card"><span className="dashboard-eyebrow">Mais espaço para você</span><h2>{active ? "Seu Premium está ativo." : "Organize tudo com Premium."}</h2><p>Metas, relatórios, Ctrl AI, múltiplos cartões e +Couple em um só lugar.</p><div className="premium-plan-switch" role="tablist" aria-label="Periodicidade do Premium"><button type="button" role="tab" aria-selected={billing === "monthly"} data-active={billing === "monthly"} onClick={() => setBilling("monthly")}>Mensal<br /><strong>R$ 19,90</strong></button><button type="button" role="tab" aria-selected={billing === "annual"} data-active={billing === "annual"} onClick={() => setBilling("annual")}>Anual <span>economize</span><br /><strong>R$ 14,90/mês</strong></button></div><small>7 dias grátis · cancele quando quiser</small></section><section className="dashboard-list-card premium-feature-card"><div className="dashboard-section-title-row"><div><span className="dashboard-eyebrow">Incluído</span><h2>O que você desbloqueia</h2></div><PremiumBadge /></div>{["Cartões e contas ilimitados", "Relatórios em Excel e PDF", "Ctrl AI sem limite", "+Couple e +Share para compartilhar", "Open Finance quando disponível"].map((feature) => <div className="premium-feature-row" key={feature}><CheckCircledIcon aria-hidden="true" /><span>{feature}</span></div>)}</section>{!active ? <button className="dashboard-primary-button premium-cta" type="button" onClick={() => { keyboard.hide(); setMessage(""); setIsCardFormOpen(true); }}>Continuar com cartão</button> : <div className="dashboard-success-note" role="status">Plano atual: {formatPlan(plan)} · {formatPlanDetail(plan)}</div>}{message ? <p className="dashboard-push-feedback" data-tone="error" role="status">{message}</p> : null}<BottomSheet open={isCardFormOpen} onOpenChange={handleCardFormChange} title="Assinar Premium" description={`Plano ${billing === "annual" ? "anual" : "mensal"} · 7 dias grátis`} snap={0.72} scrollable={false}><form className="dashboard-tool-form" onSubmit={submitCard}><LocalDataField id="premium-card-name" label="Nome no cartão" placeholder="Nome completo" value={cardName} onChange={setCardName} /><LocalDataField id="premium-card-number" label="Número do cartão" placeholder="0000 0000 0000 0000" value={cardNumber} onChange={setCardNumber} inputMode="numeric" /><div className="subscription-form-grid"><LocalDataField id="premium-card-expiry" label="Validade" placeholder="MM/AA" value={cardExpiry} onChange={setCardExpiry} /><LocalDataField id="premium-card-cvv" label="CVV" placeholder="000" value={cardCvv} onChange={setCardCvv} inputMode="numeric" /></div><p className="subscription-sheet-note">Por segurança, estes dados não são armazenados no app. A próxima etapa conecta o checkout oficial de cartão.</p><button className="dashboard-primary-button subscription-submit" type="submit">Continuar com segurança</button></form></BottomSheet></>;
}

function DashboardCouple({ plan, onOpenPremium }: { plan: MobilePlan | null; onOpenPremium: () => void }) {
  const [code] = useState(() => `CASAL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`); const [feedback, setFeedback] = useState(""); const premium = isPremiumPlan(plan); const copyCode = async () => { try { await navigator.clipboard.writeText(code); setFeedback("Código copiado."); } catch { setFeedback(`Compartilhe este código: ${code}`); } };
  return <><section className="dashboard-tool-summary" data-tone="pink"><div><span className="dashboard-eyebrow">Tudo compartilhado</span><strong>+Couple</strong></div><PersonIcon aria-hidden="true" /><p>Entradas, gastos, metas e assinaturas podem ser editados pelos dois.</p></section>{!premium ? <button className="dashboard-upgrade-banner" type="button" onClick={onOpenPremium}><PremiumBadge /><span>O +Couple faz parte do plano Premium.</span><ChevronRightIcon aria-hidden="true" /></button> : <section className="dashboard-list-card couple-local-card"><span className="dashboard-eyebrow">Convite do casal</span><h2>Compartilhe seu código</h2><p>Envie o código para a outra pessoa entrar no mesmo espaço.</p><div className="couple-code-box"><strong>{code}</strong><button className="dashboard-secondary-button" type="button" onClick={copyCode}>Copiar código</button></div>{feedback ? <p className="dashboard-push-feedback" data-tone="success" role="status">{feedback}</p> : null}</section>}<section className="dashboard-list-card couple-shared-list"><div className="dashboard-section-title-row"><div><span className="dashboard-eyebrow">Visibilidade</span><h2>Dados a dois</h2></div><CheckCircledIcon aria-hidden="true" /></div>{["Lançamentos compartilhados", "Metas e sonhos do casal", "Assinaturas divididas", "Notificações de alterações"].map((item) => <div className="premium-feature-row" key={item}><CheckCircledIcon aria-hidden="true" /><span>{item}</span></div>)}</section></>;
}

function DashboardShare({ plan, onOpenPremium }: { plan: MobilePlan | null; onOpenPremium: () => void }) {
  const keyboard = useKeyboard(); const { items, addItem, removeItem, setItems } = useLocalSharedItems(); const premium = isPremiumPlan(plan); const [title, setTitle] = useState(""); const [value, setValue] = useState(""); const [isSheetOpen, setIsSheetOpen] = useState(false); const [message, setMessage] = useState("");
  const handleSheetChange = (nextOpen: boolean) => { if (!nextOpen) keyboard.hide(); setIsSheetOpen(nextOpen); };
  const addShared = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!title.trim() || localNumber(value) <= 0) { setMessage("Informe o nome e o valor da assinatura."); return; } addItem({ title: title.trim(), value: localNumber(value), split: "50/50", status: "pending" }); setTitle(""); setValue(""); keyboard.hide(); setIsSheetOpen(false); };
  if (!premium) return <><section className="dashboard-tool-summary" data-tone="blue"><div><span className="dashboard-eyebrow">Divisão automática</span><strong>+Share</strong></div><CardStackIcon aria-hidden="true" /><p>Compartilhe uma assinatura e acompanhe quem já pagou.</p></section><button className="dashboard-upgrade-banner" type="button" onClick={onOpenPremium}><PremiumBadge /><span>O +Share está disponível no plano Premium.</span><ChevronRightIcon aria-hidden="true" /></button></>;
  return <><section className="dashboard-tool-summary" data-tone="blue"><div><span className="dashboard-eyebrow">Assinaturas em conjunto</span><strong>{items.length} compartilhadas</strong></div><CardStackIcon aria-hidden="true" /><p>Divisão 50/50 e status de pagamento em um só lugar.</p></section><button className="dashboard-primary-button" type="button" onClick={() => { keyboard.hide(); setMessage(""); setIsSheetOpen(true); }}><PlusIcon aria-hidden="true" />Compartilhar assinatura</button><section className="dashboard-list-card dashboard-tool-list"><div className="dashboard-section-title-row"><div><span className="dashboard-eyebrow">A dois</span><h2>+Share</h2></div><span className="dashboard-calendar-count">{items.length}</span></div>{items.length > 0 ? items.map((item) => <div className="dashboard-tool-row" key={item.id}><span className="dashboard-tool-avatar"><CardStackIcon aria-hidden="true" /></span><span className="dashboard-list-copy"><strong>{item.title}</strong><small>{formatCurrency(item.value / 2)} para cada pessoa · {item.status === "paid" ? "pago" : "aguardando pagamento"}</small></span><button type="button" className="dashboard-inline-action" onClick={() => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: entry.status === "paid" ? "pending" : "paid" } : entry))}>{item.status === "paid" ? "Reabrir" : "Marcar pago"}</button><button type="button" className="dashboard-inline-delete" onClick={() => removeItem(item.id)}>Excluir</button></div>) : <div className="dashboard-data-state"><strong>Nenhuma assinatura compartilhada</strong><span>Adicione uma assinatura para dividir automaticamente.</span></div>}</section><BottomSheet open={isSheetOpen} onOpenChange={handleSheetChange} title="Compartilhar assinatura" description="A divisão padrão é 50% para cada pessoa." snap={0.58} scrollable={false}><form className="dashboard-tool-form" onSubmit={addShared}><LocalDataField id="share-title" label="Nome da assinatura" placeholder="Ex.: Streaming" value={title} onChange={setTitle} /><LocalDataField id="share-value" label="Valor mensal" placeholder="59,90" value={value} onChange={setValue} inputMode="decimal" /><p className="subscription-sheet-note">O outro participante receberá o status de pagamento quando o compartilhamento estiver conectado à conta.</p>{message ? <p className="auth-error subscription-form-error" role="alert">{message}</p> : null}<button className="dashboard-primary-button subscription-submit" type="submit">Salvar compartilhamento</button></form></BottomSheet></>;
}

const dashboardNavItems: Array<{ id: DashboardTab; label: string; icon: ReactNode }> = [
  { id: "overview", label: "Início", icon: <BarChartIcon aria-hidden="true" /> },
  { id: "finances", label: "Finanças", icon: <DotsHorizontalIcon aria-hidden="true" /> },
  { id: "subscriptions", label: "Assinaturas", icon: <CardStackIcon aria-hidden="true" /> },
  { id: "calendar", label: "Calendário", icon: <CalendarIcon aria-hidden="true" /> },
  { id: "more", label: "Mais", icon: <PlusIcon aria-hidden="true" /> },
];

function DashboardScreen({ flow }: { flow: FlowControls }) {
  const { device } = useMobileDevice();
  const keyboard = useKeyboard();
  useNativeSystemBars(SystemBarsStyle.Light);
  const subscriptionState = useMobileSubscriptions();
  const appUpdate = useAppUpdate();
  const updateRelease = appUpdate.status === "available" ? appUpdate.release : null;
  const updateGrace = useUpdateGracePeriod(updateRelease);
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<MobileSubscription | null>(null);
  const [isSubscriptionSheetOpen, setIsSubscriptionSheetOpen] = useState(false);
  const [isNotificationSheetOpen, setIsNotificationSheetOpen] = useState(false);
  const [isEditProfileSheetOpen, setIsEditProfileSheetOpen] = useState(false);
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [pushTestFeedback, setPushTestFeedback] = useState("");
  const [pushTestFeedbackTone, setPushTestFeedbackTone] = useState<"success" | "error">("success");
  const notifications = buildNotifications(subscriptionState.subscriptions);

  useEffect(() => {
    const updateConnection = () => setIsOffline(!navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

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

  const openUpdateModal = () => {
    keyboard.hide();
    setIsUpdateModalOpen(true);
  };

  const openEditProfile = () => {
    keyboard.hide();
    setIsEditProfileSheetOpen(true);
  };

  const navigateToTab = (tab: DashboardTab) => {
    keyboard.hide();
    setIsMoreSheetOpen(false);
    if (tab !== "more") setActiveTab(tab);
  };

  const openMore = () => {
    keyboard.hide();
    setIsMoreSheetOpen(true);
  };

  useEffect(() => {
    if (updateGrace.isLocked) setIsUpdateModalOpen(false);
  }, [updateGrace.isLocked]);

  const testPushNotification = async () => {
    if (isTestingPush) return;
    setIsTestingPush(true);
    setPushTestFeedback("");
    const result = await requestPushNotificationTest();
    setPushTestFeedbackTone(result.ok ? "success" : "error");
    setPushTestFeedback(result.message);
    setIsTestingPush(false);
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
        <div className="dashboard-topbar-leading">
          <DashboardSpaceBadge onClick={() => flow.push(coupleSpaceScreen())} />
          {updateRelease ? <AppUpdateTrigger locked={updateGrace.isLocked} onClick={openUpdateModal} /> : null}
        </div>
        <div className="dashboard-header-actions">
          <button className="dashboard-icon-button dashboard-notification-button" type="button" aria-label="Abrir notificações" onClick={openNotifications}>
            <BellIcon aria-hidden="true" />
            {notifications.length > 0 && <span className="dashboard-notification-badge">{notifications.length > 9 ? "9+" : notifications.length}</span>}
          </button>
          <button className="dashboard-icon-button dashboard-profile-button" type="button" aria-label="Abrir perfil" onClick={() => navigateToTab("profile")}>
            {subscriptionState.profile?.avatar_url ? (
              <img src={subscriptionState.profile.avatar_url} alt="" draggable={false} />
            ) : (
              <PersonIcon aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      <MobileScroll className="dashboard-scroll">
        <main className="dashboard-content" style={{ minHeight: device.geometry.screen.height }}>
          {isOffline && (
            <div className="dashboard-offline-banner" role="status">
              Você está offline. Os lançamentos locais continuam disponíveis neste aparelho.
            </div>
          )}
          {accountError && <p className="auth-error dashboard-account-error" role="alert">{accountError}</p>}
          {activeTab === "overview" ? (
            <DashboardOverview
              {...subscriptionState}
              notificationCount={notifications.length}
              onOpenNotifications={openNotifications}
              onTabChange={navigateToTab}
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
              onTestPushNotification={testPushNotification}
              isTestingPush={isTestingPush}
              pushTestFeedback={pushTestFeedback}
              pushTestFeedbackTone={pushTestFeedbackTone}
              onOpenPremium={() => navigateToTab("premium")}
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
            data-active={activeTab === item.id || (item.id === "more" && isMoreSheetOpen)}
            onClick={() => item.id === "more" ? openMore() : navigateToTab(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <AppUpdateModal
        release={updateRelease}
        open={Boolean(updateRelease && (isUpdateModalOpen || updateGrace.isLocked))}
        locked={updateGrace.isLocked}
        remainingMs={updateGrace.remainingMs}
        onOpenChange={setIsUpdateModalOpen}
      />

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

      <DashboardMoreSheet
        open={isMoreSheetOpen}
        onOpenChange={setIsMoreSheetOpen}
        onSelect={navigateToTab}
      />
    </div>
  );
}

function CoupleSpaceScreen({ flow }: { flow: FlowControls }) {
  useNativeSystemBars(SystemBarsStyle.Light);

  return (
    <div className="couple-screen" data-testid="couple-screen">
      <header className="couple-topbar">
        <button className="couple-back-button" type="button" aria-label="Voltar para MaisCtrl" onClick={flow.pop}>
          <ArrowLeftIcon aria-hidden="true" />
        </button>
        <div className="couple-lockup" aria-label="Espaço +Couple">
          <span className="couple-lockup-mark">+Couple</span>
          <span>Espaço a dois</span>
        </div>
        <button className="couple-brand-button" type="button" aria-label="Voltar para MaisCtrl" onClick={flow.pop}>
          <img src={logoAsset} alt="" draggable={false} />
        </button>
      </header>

      <main className="couple-content">
        <section className="couple-hero">
          <div className="couple-hero-orbit couple-hero-orbit-one" aria-hidden="true" />
          <div className="couple-hero-orbit couple-hero-orbit-two" aria-hidden="true" />
          <span className="couple-overline"><span aria-hidden="true" /> MAISCTRL +COUPLE</span>
          <h1>O dinheiro de vocês, no mesmo lugar.</h1>
          <p>Um espaço para dividir planos, organizar a vida e construir juntos.</p>
          <div className="couple-connection" aria-hidden="true">
            <span className="couple-person couple-person-you">Você</span>
            <span className="couple-connection-line" />
            <span className="couple-person couple-person-plus">+</span>
          </div>
        </section>

        <section className="couple-focus-card">
          <div className="couple-card-heading">
            <span>UM ESPAÇO PARA DOIS</span>
            <strong>01</strong>
          </div>
          <h2>Mais clareza para decidir juntos.</h2>
          <p>Entradas, gastos e sonhos compartilhados em uma visão leve, sem perder o controle do que é de cada um.</p>
          <div className="couple-feature-list">
            <div className="couple-feature-item">
              <span className="couple-feature-symbol">↗</span>
              <span><strong>Planejar</strong><small>metas em comum</small></span>
            </div>
            <div className="couple-feature-item">
              <span className="couple-feature-symbol">◌</span>
              <span><strong>Dividir</strong><small>sem complicar</small></span>
            </div>
          </div>
        </section>

        <div className="couple-next-step">
          <span className="couple-next-step-dot" aria-hidden="true" />
          <span>Seu espaço +Couple começa aqui</span>
          <ChevronRightIcon aria-hidden="true" />
        </div>
      </main>
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

      <div className="dashboard-bento-grid" aria-label="Resumo financeiro">
      <motion.section
        className="dashboard-total-card dashboard-bento-total"
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

      <section className="dashboard-section dashboard-bento-insights">
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

      <section className="dashboard-list-card dashboard-bento-payments">
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
      </div>

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
      <SubscriptionAvatar name={name} tone={tone} />
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

const subscriptionLogoAliases: Array<[string, string]> = [
  ["amazon prime video", "amazonprime"],
  ["prime video", "primevideo"],
  ["youtube premium", "youtube"],
  ["disney plus", "disneyplus"],
  ["disney+", "disneyplus"],
  ["apple tv", "appletv"],
  ["google one", "googleone"],
  ["microsoft 365", "microsoft365"],
  ["chatgpt", "openai"],
  ["netflix", "netflix"],
  ["spotify", "spotify"],
  ["youtube", "youtube"],
  ["amazon", "amazon"],
  ["apple", "apple"],
  ["adobe", "adobe"],
  ["canva", "canva"],
  ["notion", "notion"],
  ["dropbox", "dropbox"],
  ["icloud", "icloud"],
  ["deezer", "deezer"],
  ["globoplay", "globoplay"],
  ["hbo max", "max"],
  ["max", "max"],
  ["crunchyroll", "crunchyroll"],
  ["paramount", "paramountplus"],
  ["twitch", "twitch"],
  ["nubank", "nubank"],
  ["mercado pago", "mercadopago"],
  ["picpay", "picpay"],
  ["paypal", "paypal"],
  ["wise", "wise"],
  ["ifood", "ifood"],
  ["adidas", "adidas"],
  ["nike", "nike"],
  ["uber", "uber"],
  ["vivo", "vivo"],
  ["fitbit", "fitbit"],
];

const subscriptionLogoDomains: Array<[string, string]> = [
  ["itau", "itau.com.br"],
  ["banco inter", "inter.co"],
  ["inter", "inter.co"],
  ["bradesco", "bradesco.com.br"],
  ["santander", "santander.com.br"],
  ["caixa", "caixa.gov.br"],
  ["banco do brasil", "bb.com.br"],
  ["bb", "bb.com.br"],
  ["btg pactual", "btgpactual.com"],
  ["c6 bank", "c6bank.com.br"],
  ["banco original", "bancooriginal.com.br"],
  ["neon", "neon.com.br"],
  ["pagbank", "pagbank.com.br"],
  ["recargapay", "recargapay.com.br"],
  ["smart fit", "smartfit.com.br"],
  ["bluefit", "bluefit.com.br"],
  ["bodytech", "bodytech.com.br"],
  ["gympass", "gympass.com"],
  ["wellhub", "wellhub.com"],
  ["totalpass", "totalpass.com.br"],
  ["decathlon", "decathlon.com.br"],
  ["centauro", "centauro.com.br"],
  ["track&field", "tf.com.br"],
  ["claro", "claro.com.br"],
  ["tim", "tim.com.br"],
  ["unimed", "unimed.coop.br"],
  ["rappi", "rappi.com.br"],
  ["99", "99app.com"],
];

function normalizeSubscriptionName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function subscriptionLogoSlug(name: string) {
  const normalizedName = normalizeSubscriptionName(name);
  return subscriptionLogoAliases.find(([alias]) => normalizedName === alias || normalizedName.includes(alias))?.[1] ?? null;
}

function subscriptionLogoDomain(name: string) {
  const normalizedName = normalizeSubscriptionName(name);
  return subscriptionLogoDomains.find(([alias]) => normalizedName === alias || normalizedName.includes(alias))?.[1] ?? null;
}

function subscriptionLogoUrl(name: string) {
  const slug = subscriptionLogoSlug(name);
  if (slug) return `https://cdn.simpleicons.org/${slug}`;

  const domain = subscriptionLogoDomain(name);
  return domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : null;
}

function SubscriptionAvatar({ name, tone, loading = "lazy" }: { name: string; tone: "red" | "green" | "orange"; loading?: "lazy" | "eager" }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = subscriptionLogoUrl(name);
  const showLogo = Boolean(logoUrl) && !logoFailed;

  return (
    <span className="dashboard-list-avatar" data-tone={tone} data-has-logo={showLogo ? "true" : "false"} data-logo-source={logoUrl?.includes("simpleicons") ? "simple-icons" : logoUrl ? "domain-favicon" : "initial"} data-testid="subscription-avatar">
      {showLogo ? (
        <img
          src={logoUrl ?? undefined}
          alt=""
          loading={loading}
          decoding="async"
          draggable={false}
          onError={() => setLogoFailed(true)}
        />
      ) : name.slice(0, 1)}
    </span>
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

function LocalTransactionSheet({
  open,
  onOpenChange,
  onCreated,
  transaction = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (transaction: Omit<LocalTransaction, "id">, id?: string) => void;
  transaction?: LocalTransaction | null;
}) {
  const keyboard = useKeyboard();
  const [type, setType] = useState<LocalTransactionType>("expense");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Geral");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setType(transaction.type);
      setDescription(transaction.description);
      setCategory(transaction.category);
      setValue(String(transaction.value).replace(".", ","));
      setDate(transaction.date);
      setError("");
    }
  }, [open, transaction?.id]);

  const reset = () => {
    setType("expense");
    setDescription("");
    setCategory("Geral");
    setValue("");
    setDate(new Date().toISOString().slice(0, 10));
    setError("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      keyboard.hide();
      reset();
    }
    onOpenChange(nextOpen);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    keyboard.hide();
    const parsedValue = Number(value.replace(",", "."));

    if (!description.trim() || !Number.isFinite(parsedValue) || parsedValue <= 0 || !date) {
      setError("Preencha descrição, valor e data.");
      return;
    }

    onCreated({ type, description: description.trim(), category: category.trim() || "Geral", value: parsedValue, date }, transaction?.id);
    handleOpenChange(false);
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={transaction ? "Editar lançamento" : "Novo lançamento"}
      description={transaction ? "Corrija os dados deste registro local." : "Organize uma entrada ou saída enquanto o banco não está conectado."}
      snap={0.68}
      scrollable={false}
    >
      <form className="subscription-form finance-entry-form" onSubmit={submit}>
        <div className="finance-type-switch" role="group" aria-label="Tipo de lançamento">
          <button className="finance-type-button" data-active={type === "expense"} type="button" onClick={() => setType("expense")}>Saída</button>
          <button className="finance-type-button" data-active={type === "income"} type="button" onClick={() => setType("income")}>Entrada</button>
        </div>

        <label className="mobile-field" htmlFor="finance-description">
          <span className="field-label">Descrição</span>
          <span className="input-shell">
            <KeyboardInput
              id="finance-description"
              value={description}
              placeholder={type === "expense" ? "Ex.: Mercado" : "Ex.: Salário"}
              autoCapitalize="sentences"
              autoCorrect="off"
              onChange={(event) => {
                setDescription(event.target.value);
                setError("");
              }}
            />
          </span>
        </label>

        <label className="mobile-field" htmlFor="finance-value">
          <span className="field-label">Valor</span>
          <span className="input-shell">
            <span className="input-prefix">R$</span>
            <KeyboardInput
              id="finance-value"
              type="text"
              inputMode="decimal"
              value={value}
              placeholder="0,00"
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
              }}
            />
          </span>
        </label>

        <div className="subscription-form-grid">
          <label className="mobile-field" htmlFor="finance-category">
            <span className="field-label">Categoria</span>
            <span className="input-shell">
              <KeyboardInput id="finance-category" value={category} placeholder="Geral" onChange={(event) => setCategory(event.target.value)} />
            </span>
          </label>
          <MobileDateField id="finance-date" label="Data" value={date} onChange={setDate} />
        </div>

        {error && <p className="auth-error subscription-form-error" role="alert">{error}</p>}

        <button className="dashboard-primary-button subscription-submit" type="submit">{transaction ? "Salvar alterações" : "Salvar lançamento"}</button>
      </form>
    </BottomSheet>
  );
}

function OfxImportSheet({
  open,
  onOpenChange,
  fileName,
  result,
  duplicateCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  result: OfxImportResult | null;
  duplicateCount: number;
  onConfirm: () => void;
}) {
  if (!result) return null;

  const newCount = result.transactions.length - duplicateCount;
  const totalValue = result.transactions.reduce((sum, transaction) => sum + transaction.value, 0);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Importar extrato" description={`${result.institution} · ${fileName}`} snap={0.82} scrollable>
      <div className="ofx-import-content">
        <section className="ofx-import-summary" aria-label="Resumo da importação">
          <div><span>Encontrados</span><strong>{result.transactions.length}</strong></div>
          <div><span>Novos</span><strong>{newCount}</strong></div>
          <div><span>Valor total</span><strong>{formatCurrency(totalValue)}</strong></div>
        </section>

        <div className="ofx-import-note">
          <strong>Confira antes de lançar</strong>
          <span>As movimentações entram como categoria “Importado” e ficam salvas apenas neste aparelho.</span>
        </div>

        <section className="ofx-import-preview" aria-label="Prévia dos lançamentos">
          <div className="dashboard-section-title-row">
            <div><span className="dashboard-eyebrow">Prévia</span><h2>Últimas movimentações</h2></div>
            <span className="dashboard-calendar-count">{result.transactions.length}</span>
          </div>
          {result.transactions.slice(0, 6).map((transaction) => (
            <div className="ofx-import-row" key={transaction.sourceId}>
              <span className="dashboard-list-avatar" data-tone={transaction.type === "income" ? "green" : "red"}>{transaction.type === "income" ? "+" : "−"}</span>
              <span className="dashboard-list-copy"><strong>{transaction.description}</strong><small>{formatShortDate(transaction.date)} · Importado</small></span>
              <strong className="ofx-import-value" data-type={transaction.type}>{transaction.type === "income" ? "+" : "−"}{formatCurrency(transaction.value)}</strong>
            </div>
          ))}
        </section>

        {duplicateCount > 0 && <p className="ofx-import-feedback" data-tone="info" role="status">{duplicateCount} lançamento{duplicateCount === 1 ? " já existe" : "s já existem"} e não {duplicateCount === 1 ? "será duplicado" : "serão duplicados"}.</p>}
        {result.skipped > 0 && <p className="ofx-import-feedback" data-tone="warning" role="status">{result.skipped} registro{result.skipped === 1 ? " foi ignorado" : "s foram ignorados"} por falta de data ou valor válido.</p>}

        <button className="dashboard-primary-button subscription-submit" type="button" onClick={onConfirm} disabled={newCount <= 0}>
          {newCount > 0 ? `Importar ${newCount} lançamento${newCount === 1 ? "" : "s"}` : "Nenhum lançamento novo"}
        </button>
      </div>
    </BottomSheet>
  );
}

function DashboardFinance() {
  const keyboard = useKeyboard();
  const { transactions, addTransaction, addTransactions, updateTransaction, removeTransaction } = useLocalFinance();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<LocalTransaction | null>(null);
  const [isImportSheetOpen, setIsImportSheetOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importResult, setImportResult] = useState<OfxImportResult | null>(null);
  const [importError, setImportError] = useState("");
  const [importFeedback, setImportFeedback] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [view, setView] = useState<"overview" | "entries">("overview");
  const [periodFilter, setPeriodFilter] = useState<"month" | "all">("month");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | LocalTransactionType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const currentMonth = new Date().toISOString().slice(0, 7);
  const periodTransactions = transactions.filter((transaction) => periodFilter === "all" || transaction.date.startsWith(currentMonth));
  const income = periodTransactions.filter((transaction) => transaction.type === "income").reduce((total, transaction) => total + transaction.value, 0);
  const expenses = periodTransactions.filter((transaction) => transaction.type === "expense").reduce((total, transaction) => total + transaction.value, 0);
  const balance = income - expenses;
  const categories = Array.from(new Set(periodTransactions.map((transaction) => transaction.category))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filteredTransactions = [...periodTransactions]
    .filter((transaction) => typeFilter === "all" || transaction.type === typeFilter)
    .filter((transaction) => categoryFilter === "all" || transaction.category === categoryFilter)
    .filter((transaction) => {
      const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
      if (!normalizedQuery) return true;
      return `${transaction.description} ${transaction.category}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const recentTransactions = filteredTransactions.slice(0, 5);
  const categoryTotals = Array.from(new Set(periodTransactions.map((transaction) => transaction.category)))
    .map((category) => ({
      category,
      value: periodTransactions.filter((transaction) => transaction.type === "expense" && transaction.category === category).reduce((total, transaction) => total + transaction.value, 0),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
  const largestExpense = periodTransactions.filter((transaction) => transaction.type === "expense").sort((a, b) => b.value - a.value)[0] ?? null;
  const expenseRatio = income > 0 ? expenses / income : null;
  const healthTone = balance < 0 ? "attention" : expenseRatio !== null && expenseRatio > 0.8 ? "watch" : "good";
  const healthTitle = healthTone === "attention" ? "Atenção ao saldo" : healthTone === "watch" ? "Observe o ritmo" : "Você está no controle";
  const periodLabel = periodFilter === "all" ? "Todo o período" : "Este mês";

  const openNewTransaction = () => {
    keyboard.hide();
    setSelectedTransaction(null);
    setIsSheetOpen(true);
  };

  const openImportPicker = () => {
    keyboard.hide();
    setImportError("");
    importInputRef.current?.click();
  };

  const handleOfxFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setImportError("O arquivo precisa ter no máximo 10 MB.");
      return;
    }

    try {
      const parsed = parseOfxTransactions(await readOfxFile(file));
      setImportFileName(file.name);
      setImportResult(parsed);
      setImportFeedback("");
      setImportError("");
      keyboard.hide();
      setIsImportSheetOpen(true);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Não foi possível ler esse arquivo.");
    }
  };

  const duplicateCount = importResult?.transactions.filter((transaction) => transaction.sourceId && transactions.some((current) => current.sourceId === transaction.sourceId)).length ?? 0;

  const confirmImport = () => {
    if (!importResult) return;
    const freshTransactions = importResult.transactions.filter((transaction) => !transaction.sourceId || !transactions.some((current) => current.sourceId === transaction.sourceId));
    if (freshTransactions.length === 0) return;
    addTransactions(freshTransactions);
    setImportFeedback(`${freshTransactions.length} lançamento${freshTransactions.length === 1 ? "" : "s"} importado${freshTransactions.length === 1 ? "" : "s"}.`);
    setView("entries");
    setPeriodFilter("all");
    keyboard.hide();
    setIsImportSheetOpen(false);
  };

  const handleImportSheetChange = (open: boolean) => {
    if (!open) keyboard.hide();
    setIsImportSheetOpen(open);
  };

  const openEditTransaction = (transaction: LocalTransaction) => {
    setSelectedTransaction(transaction);
    setIsSheetOpen(true);
  };

  const handleTransactionSave = (transaction: Omit<LocalTransaction, "id">, id?: string) => {
    if (id) updateTransaction(id, transaction);
    else addTransaction(transaction);
  };

  const exportTransactions = () => {
    if (transactions.length === 0) return;
    const header = "tipo;descrição;categoria;valor;data";
    const rows = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).map((transaction) => [
      transaction.type === "income" ? "entrada" : "saída",
      transaction.description,
      transaction.category,
      transaction.value.toFixed(2).replace(".", ","),
      transaction.date,
    ].map((value) => `"${value.replaceAll('"', '""')}"`).join(";"));
    const blob = new Blob([`${header}\n${rows.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `maisctrl-lancamentos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="finance-summary-bento">
        <section className="finance-balance-card" aria-label="Resumo financeiro local">
          <div className="finance-balance-heading">
            <div>
              <span className="dashboard-eyebrow">Resumo local</span>
              <strong>Saldo estimado</strong>
            </div>
            <span className="finance-local-badge">Neste aparelho</span>
          </div>
          <strong className="finance-balance-value">{formatCurrency(balance)}</strong>
          <span className="dashboard-card-caption">Os lançamentos ficam salvos neste aparelho até o banco ser conectado.</span>
        </section>

        <div className="finance-metric-grid">
          <div className="finance-metric-card" data-tone="green"><span>Entradas</span><strong>{formatCurrency(income)}</strong></div>
          <div className="finance-metric-card" data-tone="red"><span>Saídas</span><strong>{formatCurrency(expenses)}</strong></div>
        </div>
      </div>

      <div className="finance-primary-actions">
        <button className="dashboard-primary-button finance-add-button" type="button" onClick={openNewTransaction}>
          <PlusIcon aria-hidden="true" />
          Novo lançamento
        </button>
        <button className="finance-import-button" type="button" onClick={openImportPicker}>Importar OFX</button>
        <input ref={importInputRef} className="finance-file-input" type="file" accept=".ofx,.qfx,application/x-ofx,application/vnd.intu.qfx" onChange={handleOfxFileChange} aria-label="Selecionar arquivo OFX" />
      </div>
      {importError && <p className="auth-error finance-import-error" role="alert">{importError}</p>}
      {importFeedback && <p className="dashboard-push-feedback finance-import-feedback" data-tone="success" role="status">{importFeedback}</p>}

      <div className="finance-view-switch" role="tablist" aria-label="Conteúdo financeiro">
        <button type="button" role="tab" aria-selected={view === "overview"} data-active={view === "overview"} onClick={() => setView("overview")}>Visão geral</button>
        <button type="button" role="tab" aria-selected={view === "entries"} data-active={view === "entries"} onClick={() => setView("entries")}>Lançamentos</button>
      </div>

      <label className="finance-period-bar">
        <span>Período dos dados</span>
        <select aria-label="Filtrar por período" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as "month" | "all")}>
          <option value="month">Este mês</option>
          <option value="all">Todo o período</option>
        </select>
      </label>

      {view === "overview" ? (
        <>
          <section className="finance-health-card" data-tone={healthTone} aria-label="Saúde financeira local">
            <div className="finance-health-heading">
              <div>
                <span className="dashboard-eyebrow">{periodLabel}</span>
                <strong>{healthTitle}</strong>
              </div>
              <span className="finance-health-score">{income > 0 ? `${Math.max(0, Math.round((1 - (expenses / income)) * 100))}%` : "—"}</span>
            </div>
            <p>{periodTransactions.length === 0 ? "Registre uma entrada ou saída para começar a acompanhar sua saúde financeira." : largestExpense ? `Maior saída: ${largestExpense.description} · ${formatCurrency(largestExpense.value)}.` : "Ainda não há saídas registradas neste período."}</p>
          </section>

          {categoryTotals.length > 0 && (
            <section className="finance-category-card" aria-label="Gastos por categoria">
              <div className="dashboard-section-title-row">
                <div>
                  <span className="dashboard-eyebrow">Distribuição</span>
                  <h2>Gastos por categoria</h2>
                </div>
              </div>
              <div className="finance-category-list">
                {categoryTotals.map((item) => (
                  <div className="finance-category-row" key={item.category}>
                    <span>{item.category}</span>
                    <div className="finance-category-track"><span style={{ width: `${Math.min(100, expenses > 0 ? (item.value / expenses) * 100 : 0)}%` }} /></div>
                    <strong>{formatCurrency(item.value)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="finance-tools-card">
          <div className="dashboard-section-title-row">
            <div>
              <span className="dashboard-eyebrow">Próximas áreas</span>
              <h2>Seu dinheiro, por partes</h2>
            </div>
          </div>
          <div className="finance-tools-grid">
            <div className="finance-tool-card"><CardStackIcon aria-hidden="true" /><strong>Cartões</strong><span>Limites e faturas</span></div>
            <div className="finance-tool-card"><ArrowLeftIcon aria-hidden="true" /><strong>Dívidas</strong><span>Saldo devedor</span></div>
            <div className="finance-tool-card"><CalendarIcon aria-hidden="true" /><strong>Parcelas</strong><span>Progresso mensal</span></div>
            <div className="finance-tool-card"><BarChartIcon aria-hidden="true" /><strong>Investimentos</strong><span>Patrimônio e metas</span></div>
          </div>
          </section>
        </>
      ) : (
        <section className="dashboard-list-card finance-entries-card">
          <div className="dashboard-section-title-row">
            <div>
              <span className="dashboard-eyebrow">Histórico local</span>
              <h2>Últimos lançamentos</h2>
            </div>
            <div className="finance-entry-header-actions">
              <span className="dashboard-calendar-count">{filteredTransactions.length}</span>
              <button className="finance-export-button" type="button" onClick={exportTransactions} disabled={transactions.length === 0}>Exportar</button>
            </div>
          </div>
          <div className="finance-filters" aria-label="Filtros de lançamentos">
            <label className="finance-search-field">
              <span className="sr-only">Buscar lançamento</span>
              <KeyboardInput value={query} placeholder="Buscar" onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="finance-filter-field">
              <span className="sr-only">Filtrar por tipo</span>
              <select aria-label="Filtrar por tipo" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | LocalTransactionType)}>
                <option value="all">Todos</option>
                <option value="income">Entradas</option>
                <option value="expense">Saídas</option>
              </select>
            </label>
            <label className="finance-filter-field">
              <span className="sr-only">Filtrar por categoria</span>
              <select aria-label="Filtrar por categoria" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">Categorias</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
          </div>
          {recentTransactions.length > 0 ? recentTransactions.map((transaction) => (
            <div className="finance-entry-row" key={transaction.id}>
              <span className="dashboard-list-avatar" data-tone={transaction.type === "income" ? "green" : "red"}>{transaction.type === "income" ? "+" : "−"}</span>
              <span className="dashboard-list-copy"><strong>{transaction.description}</strong><small>{transaction.category} · {formatShortDate(transaction.date)}</small></span>
              <span className="finance-entry-amount" data-type={transaction.type}>{transaction.type === "income" ? "+" : "−"}{formatCurrency(transaction.value)}</span>
              <div className="finance-entry-actions">
                <button className="finance-entry-edit" type="button" aria-label={`Editar lançamento: ${transaction.description}`} onClick={() => openEditTransaction(transaction)}>Editar</button>
                <button className="finance-entry-delete" type="button" onClick={() => removeTransaction(transaction.id)}>Excluir</button>
              </div>
            </div>
          )) : (
            <div className="dashboard-data-state"><strong>{transactions.length > 0 ? "Nenhum lançamento encontrado" : "Nenhum lançamento ainda"}</strong><span>{transactions.length > 0 ? "Tente ajustar os filtros ou a busca." : "Comece registrando uma entrada ou saída."}</span></div>
          )}
        </section>
      )}

      <LocalTransactionSheet open={isSheetOpen} onOpenChange={(open) => { setIsSheetOpen(open); if (!open) setSelectedTransaction(null); }} transaction={selectedTransaction} onCreated={handleTransactionSave} />
      <OfxImportSheet open={isImportSheetOpen} onOpenChange={handleImportSheetChange} fileName={importFileName} result={importResult} duplicateCount={duplicateCount} onConfirm={confirmImport} />
    </>
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
  onTestPushNotification,
  isTestingPush,
  pushTestFeedback,
  pushTestFeedbackTone,
  onOpenPremium,
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
  onTestPushNotification: () => void;
  isTestingPush: boolean;
  pushTestFeedback: string;
  pushTestFeedbackTone: "success" | "error";
  onOpenPremium: () => void;
}) {
  const moduleCopy = {
    finances: {
      eyebrow: "Seu dinheiro",
      title: "Finanças",
      description: "Um lugar simples para enxergar entradas, saídas e próximos controles.",
      action: "Novo lançamento",
    },
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
    cards: {
      eyebrow: "Crédito organizado",
      title: "Cartões e faturas",
      description: "Acompanhe limites, faturas e datas importantes.",
      action: "Adicionar cartão",
    },
    financings: {
      eyebrow: "Compromissos longos",
      title: "Parcelas e financiamentos",
      description: "Veja quanto já foi pago e o que ainda falta.",
      action: "Adicionar financiamento",
    },
    loans: {
      eyebrow: "Crédito e dívidas",
      title: "Empréstimos e dívidas",
      description: "Organize saldos e acompanhe cada parcela.",
      action: "Adicionar empréstimo",
    },
    goals: {
      eyebrow: "Planos que importam",
      title: "Metas e sonhos",
      description: "Dê um prazo e um caminho para cada objetivo.",
      action: "Nova meta",
    },
    tasks: {
      eyebrow: "Organização",
      title: "Tarefas e lembretes",
      description: "Pequenos lembretes para cuidar do seu dinheiro.",
      action: "Nova tarefa",
    },
    reports: {
      eyebrow: "Visão financeira",
      title: "Relatórios",
      description: "Entenda seu momento com dados simples.",
      action: "Exportar relatório",
    },
    ai: {
      eyebrow: "Seu copiloto",
      title: "Ctrl AI",
      description: "Pergunte, entenda e tome decisões com mais clareza.",
      action: "Perguntar",
    },
    premium: {
      eyebrow: "Plano MaisCtrl",
      title: "Premium",
      description: "Mais espaço para compartilhar e organizar.",
      action: "Assinar Premium",
    },
    couple: {
      eyebrow: "Espaço compartilhado",
      title: "+Couple",
      description: "O dinheiro de vocês, no mesmo lugar.",
      action: "Conectar casal",
    },
    share: {
      eyebrow: "Assinaturas em conjunto",
      title: "+Share",
      description: "Divida assinaturas e acompanhe pagamentos.",
      action: "Compartilhar assinatura",
    },
    more: {
      eyebrow: "Mais controles",
      title: "Mais",
      description: "Escolha uma área para continuar.",
      action: "Abrir controles",
    },
  }[tab];

  return (
    <motion.div className="dashboard-module" data-tab={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <span className="dashboard-eyebrow">{moduleCopy.eyebrow}</span>
      <h1>{moduleCopy.title}</h1>
      <p className="dashboard-module-description">{moduleCopy.description}</p>
      {tab === "profile" ? (
        <button className="dashboard-secondary-button dashboard-profile-edit-button" type="button" onClick={onEditProfile}>
          Editar perfil
        </button>
      ) : tab === "finances" || ["cards", "financings", "loans", "goals", "tasks", "reports", "ai", "premium", "couple", "share"].includes(tab) ? null : (
        <button className="dashboard-primary-button" type="button" onClick={onAddSubscription}>
          <PlusIcon aria-hidden="true" />
          {moduleCopy.action}
        </button>
      )}

      {tab === "finances" ? (
        <DashboardFinance />
      ) : tab === "calendar" ? (
        <DashboardCalendar
          subscriptions={subscriptions}
          isLoading={isLoading}
          error={error}
          refresh={refresh}
          onSubscriptionClick={onSubscriptionClick}
        />
      ) : tab === "cards" ? (
        <DashboardCards plan={plan} onOpenPremium={onOpenPremium} />
      ) : tab === "financings" ? (
        <DashboardCredit mode="financings" plan={plan} onOpenPremium={onOpenPremium} />
      ) : tab === "loans" ? (
        <DashboardCredit mode="loans" plan={plan} onOpenPremium={onOpenPremium} />
      ) : tab === "goals" ? (
        <DashboardGoals plan={plan} onOpenPremium={onOpenPremium} />
      ) : tab === "tasks" ? (
        <DashboardTasks />
      ) : tab === "reports" ? (
        <DashboardReports subscriptions={subscriptions} plan={plan} onOpenPremium={onOpenPremium} />
      ) : tab === "ai" ? (
        <DashboardAI plan={plan} onOpenPremium={onOpenPremium} />
      ) : tab === "premium" ? (
        <DashboardPremium plan={plan} />
      ) : tab === "couple" ? (
        <DashboardCouple plan={plan} onOpenPremium={onOpenPremium} />
      ) : tab === "share" ? (
        <DashboardShare plan={plan} onOpenPremium={onOpenPremium} />
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
            <div className="dashboard-profile-notifications">
              <div className="dashboard-profile-section-heading">
                <strong>Notificações do celular</strong>
                <small>Confira se o push deste aparelho está funcionando.</small>
              </div>
              <button className="dashboard-secondary-button dashboard-push-test-button" type="button" onClick={onTestPushNotification} disabled={isTestingPush}>
                <BellIcon aria-hidden="true" />
                {isTestingPush ? "Enviando teste..." : "Testar notificação push"}
              </button>
              {pushTestFeedback && <p className="dashboard-push-feedback" data-tone={pushTestFeedbackTone} role="status">{pushTestFeedback}</p>}
            </div>
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

function passwordRecoveryScreen(): FlowScreen {
  return { id: "password-recovery", render: (flow) => <PasswordRecoveryScreen flow={flow} /> };
}

function dashboardScreen(): FlowScreen {
  return { id: "dashboard", render: (flow) => <DashboardScreen flow={flow} /> };
}

function coupleSpaceScreen(): FlowScreen {
  return { id: "couple-space", render: (flow) => <CoupleSpaceScreen flow={flow} /> };
}

export default function Prototype() {
  const { ready, hasSession, isPasswordRecovery } = useInitialAuthState();

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

  if (isPasswordRecovery && hasSession) {
    return <FlowStack key="password-recovery" initial={passwordRecoveryScreen()} />;
  }

  return <FlowStack key={hasSession ? "authenticated" : "public"} initial={hasSession ? dashboardScreen() : splashScreen()} />;
}
