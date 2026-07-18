"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useMemo,
  useState,
} from "react";
import { Info } from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import { appText } from "@/lib/language";
import { cn } from "@/lib/utils";

type HeaderUnclutterContextValue = {
  panelId: string;
  visible: boolean;
  toggle: () => void;
};

const HeaderUnclutterContext =
  createContext<HeaderUnclutterContextValue | null>(null);

export function HeaderUnclutterScope({
  header,
  children,
  defaultVisible = false,
}: {
  header: ReactNode;
  children: ReactNode;
  defaultVisible?: boolean;
}) {
  const panelId = useId();
  const [visible, setVisible] = useState(defaultVisible);
  const contextValue = useMemo<HeaderUnclutterContextValue>(
    () => ({
      panelId,
      visible,
      toggle: () => setVisible((current) => !current),
    }),
    [panelId, visible],
  );

  return (
    <HeaderUnclutterContext.Provider value={contextValue}>
      <div
        id={panelId}
        hidden={!visible}
        className={visible ? undefined : "hidden"}
      >
        {header}
      </div>
      {children}
    </HeaderUnclutterContext.Provider>
  );
}

export function HeaderUnclutterButton({
  className,
}: {
  className?: string;
}) {
  const context = useContext(HeaderUnclutterContext);
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  if (!context) {
    return null;
  }

  const label = context.visible
    ? t("Hide header context")
    : t("Show header context");

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-controls={context.panelId}
      aria-expanded={context.visible}
      aria-label={label}
      title={label}
      onClick={context.toggle}
      className={cn("text-muted-foreground", className)}
    >
      <Info className="h-3.5 w-3.5" />
    </Button>
  );
}
