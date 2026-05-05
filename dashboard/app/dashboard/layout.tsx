import Link from "next/link";
import { getUser } from "@/lib/api";

const NAV = [
  { href: "/overview",  label: "Overview",  icon: "◈" },
  { href: "/goals",     label: "Goals",     icon: "◎" },
  { href: "/spending",  label: "Spending",  icon: "◱" },
  { href: "/settings",  label: "Settings",  icon: "◬" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  try {
    user = await getUser();
  } catch {
    // API not running yet — still render layout
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-border bg-bg-2 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border">
          <div className="font-display text-2xl tracking-widest text-cyan">MONOX</div>
          <div className="text-ink-2 text-[10px] tracking-widest mt-0.5">PERSONAL BOT</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-ink-2 text-xs
                         hover:bg-bg-3 hover:text-cyan transition-colors mb-0.5
                         [&.active]:bg-bg-3 [&.active]:text-cyan [&.active]:border-l-2 [&.active]:border-cyan"
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="font-mono tracking-wide">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* User pill */}
        {user && (
          <div className="px-4 py-4 border-t border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-cyan-muted border border-cyan/20 flex items-center justify-center text-cyan text-xs font-semibold">
                {user.name[0]}
              </div>
              <div>
                <div className="text-ink text-xs font-medium">{user.name}</div>
                <div className="text-ink-2 text-[10px]">Level {user.level} · {user.xp} XP</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}