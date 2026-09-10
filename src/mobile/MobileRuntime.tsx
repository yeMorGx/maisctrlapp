import { useEffect, type PropsWithChildren } from "react";
import { Capacitor } from "@capacitor/core";
import { MobileDeviceProvider, useMobileDevice } from "./Device";
import { KeyboardDock, KeyboardProvider, useKeyboard } from "./Keyboard";
import { PhoneFrame } from "./PhoneFrame";
import { HomeIndicator, StatusBar } from "./components";

export function MobileRuntime({ children }: PropsWithChildren) {
  const isNative = Capacitor.isNativePlatform();

  return (
    <MobileDeviceProvider>
      <KeyboardProvider simulate={!isNative}>
        {isNative ? (
          <PhoneFrame native>
            <MobileAppViewport>{children}</MobileAppViewport>
          </PhoneFrame>
        ) : (
          <PhoneFrame>
            <KeyboardPreview />
            <StatusBar />
            <MobileAppViewport>{children}</MobileAppViewport>
            <HomeIndicator />
            <KeyboardDock />
          </PhoneFrame>
        )}
      </KeyboardProvider>
    </MobileDeviceProvider>
  );
}

function MobileAppViewport({ children }: PropsWithChildren) {
  const { device } = useMobileDevice();
  const keyboard = useKeyboard();

  return (
    <div
      className="mobile-app-viewport"
      data-keyboard-visible={keyboard.visible ? "true" : "false"}
      data-platform={device.platform}
      data-testid="mobile-app-viewport"
    >
      {children}
    </div>
  );
}

function KeyboardPreview() {
  const keyboard = useKeyboard();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("keyboard") === "1") {
      keyboard.show();
    }
  }, [keyboard]);

  return null;
}
