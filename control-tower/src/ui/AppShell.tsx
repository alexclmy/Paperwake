"use client";

import { PanelLangProvider } from "./panelLang";
import type { PanelLang } from "@/core/render/i18n";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiSend } from "./api";
import { DeviceChip } from "./DeviceChip";
import { PageDeviceStateProvider, usePageDeviceStatePresence } from "./pageDeviceState";
import { ToastProvider } from "./Toast";
import { useDeviceState } from "./useDeviceState";

/**
 * Primary places first, then a quieter secondary group. On a phone the tab
 * bar carries the four primary ones; Voice stays reachable from the sidebar
 * and from Device, and its route is unchanged.
 */
const NAV = [
  { href: "/overview", label: "Home", icon: "home", quiet: false },
  { href: "/dashboards", label: "Compositions", icon: "grid", quiet: false },
  { href: "/device", label: "Device", icon: "device", quiet: false },
  { href: "/diagnostics", label: "Advanced", icon: "gear", quiet: true },
] as const;

const SECONDARY = [{ href: "/voice", label: "Voice", icon: "mic" }] as const;

type IconName = "home" | "grid" | "device" | "gear" | "mic" | "logout" | "density";

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
    grid: (
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
      </>
    ),
    device: (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <path d="M6 9h7M6 12.5h5M15.5 15h2.5" />
      </>
    ),
    gear: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
      </>
    ),
    logout: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />,
    density: <path d="M4 6h16M4 12h16M4 18h16" />,
  };
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export function AppShell({
  children,
  simulated,
  deviceLabel,
  density,
  panelLang = "fr",
}: {
  children: ReactNode;
  simulated: boolean;
  deviceLabel: string;
  density: "comfortable" | "compact";
  panelLang?: PanelLang;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [densityValue, setDensityValue] = useState(density);
  const bannerRef = useRef<HTMLDivElement>(null);

  /*
   * Publish the banner's real height as a CSS variable.
   *
   * The header is `position: sticky; top: var(--banner-height)`, and the
   * SIMULATED banner sits above it and is sticky too. Without the offset the
   * header would stick to the top of the viewport and slide *under* the banner
   * as soon as the page scrolled, leaving the banner's bottom border cutting
   * across the nav row. Guessing a fixed height would be wrong the moment the
   * sentence wraps, which it does between 760 px and about 1100 px, so it is
   * measured.
   */
  useEffect(() => {
    const node = bannerRef.current;
    const root = document.documentElement;
    if (!node) {
      root.style.removeProperty("--banner-height");
      return;
    }
    const publish = (): void => {
      root.style.setProperty(
        "--banner-height",
        `${Math.round(node.getBoundingClientRect().height)}px`,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--banner-height");
    };
  }, [simulated]);

  // Shared across the shell and every page: one read, one word, one place it
  // is decided. See src/ui/useDeviceState.ts.
  const device = useDeviceState();

  // Kept so a page can still say whether it is carrying the device state
  // itself. Nothing in the shell duplicates a page's controls any more — the
  // rail that used to is gone — but the registration is what Overview and
  // Device use to avoid stacking two readings of their own.
  const pageState = usePageDeviceStatePresence();

  /*
   * "Compositions" is current for the editor too.
   *
   * `/dashboards/<id>/edit` is not a fifth place; it is what you are doing
   * inside the gallery, and a nav that highlighted nothing while a person was
   * editing left them with no indication of where they were. Prefix matching
   * rather than an exact compare, and it is exactly why `current` takes the
   * href rather than comparing against `pathname` at each call site.
   */
  const current = (href: string): "page" | undefined =>
    pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined;

  async function signOut(): Promise<void> {
    try {
      await apiSend("/api/auth/logout", "POST");
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  async function toggleDensity(): Promise<void> {
    const next = densityValue === "compact" ? "comfortable" : "compact";
    setDensityValue(next);
    try {
      await apiSend("/api/state", "PATCH", { density: next });
    } catch {
      // The preference is cosmetic and already applied locally; a tower that
      // refused to store it is not worth an error banner over.
    }
  }

  const utilities = (
    <>
      <button
        className="side-link"
        onClick={() => void toggleDensity()}
        data-testid="density-toggle"
        aria-pressed={densityValue === "compact"}
      >
        <NavIcon name="density" />
        {densityValue === "compact" ? "Comfortable spacing" : "Compact spacing"}
      </button>
      <button className="side-link" onClick={signOut} data-testid="sign-out">
        <NavIcon name="logout" />
        Sign out
      </button>
    </>
  );

  return (
    <PanelLangProvider initial={panelLang}>
    <ToastProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {simulated && (
        <div
          className="simulated-banner"
          data-testid="simulated-banner"
          ref={bannerRef}
        >
          <span className="banner-word">SIMULATED</span>
          {/*
            One sentence at every width, which it did not used to be: the old
            wording ran to three lines on a 375 px screen and pushed the thing
            it is a label for — the panel — off the first screenful, so there
            was a long version and a short one chosen by a media query. This
            one is short enough to need neither, and it keeps the load-bearing
            words: not the simulator in general, the mock that is in this
            repository, and not your panel.
          */}
          <span>Actions here touch the in-repo mock, not your panel.</span>
        </div>
      )}

      <div className="shell" data-density={densityValue}>
        <aside className="sidebar">
          <Link className="brand" href="/overview">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-text">
              <span className="brand-name">NOTE4C</span>
              <span className="brand-sub">Control Tower</span>
            </span>
          </Link>
          <nav className="top-nav" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current(item.href)}
                data-quiet={item.quiet ? "true" : undefined}
              >
                <NavIcon name={item.icon} />
                {item.label}
              </Link>
            ))}
            <span className="side-group-label">Labs</span>
            {SECONDARY.map((item) => (
              <Link key={item.href} href={item.href} aria-current={current(item.href)} data-quiet="true">
                <NavIcon name={item.icon} />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="side-foot">
            <span className="side-device" title="The address the tower would talk to">
              {deviceLabel}
            </span>
            {utilities}
          </div>
        </aside>

        <div className="shell-body">
          <header className="app-header">
            <div className="header-inner">
              <Link className="brand brand-compact" href="/overview">
                <span className="brand-mark" aria-hidden="true" />
                <span className="brand-name">NOTE4C</span>
              </Link>
              <span className="header-spacer" />
              {device.input && (
                <DeviceChip
                  reading={{
                    input: device.input,
                    observed: device.observed ?? true,
                    nextWakeLabel: device.nextWakeLabel ?? null,
                    address: device.address ?? null,
                    simulated: device.simulated ?? simulated,
                  }}
                />
              )}
            </div>
          </header>

          <main className="main" id="main">
            <PageDeviceStateProvider value={pageState.register}>
              {children}
            </PageDeviceStateProvider>
          </main>
        </div>
      </div>

      <nav className="tabs" aria-label="Main">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current(item.href)}
            data-quiet={item.quiet ? "true" : undefined}
          >
            <NavIcon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>
    </ToastProvider>
    </PanelLangProvider>
  );
}
