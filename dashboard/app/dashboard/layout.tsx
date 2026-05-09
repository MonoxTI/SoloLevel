import Link from "next/link";
import { getUser } from "@/lib/api";

const NAV = [
  { href: "/",  label: "Overview",  icon: "◈" },
  { href: "/dashboard/goals",     label: "Goals",     icon: "◎" },
  { href: "/dashboard/spending",  label: "Spending",  icon: "◱" },
  { href: "/dashboard/trading",   label: "Trading",   icon: "◬" },
  { href: "/dashboard/settings",  label: "Settings",  icon: "⊙" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  try { user = await getUser(); } catch {}

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 border-r border-border bg-bg-2 flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <div className="font-display text-2xl tracking-widest text-cyan">MONOX</div>
          <div className="text-ink-2 text-[10px] tracking-widest mt-0.5">PERSONAL BOT</div>
        </div>

        <nav className="flex-1 py-4 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-ink-2 text-xs
                         hover:bg-bg-3 hover:text-cyan transition-colors mb-0.5"
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="font-mono tracking-wide">{item.label}</span>
            </Link>
          ))}
        </nav>

        {user && (
          <div className="px-4 py-4 border-t border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-cyan-muted border border-cyan/20
                              flex items-center justify-center text-cyan text-xs font-semibold">
                {user.name[0]}
              </div>
              <div>
                <div className="text-ink text-xs font-medium">{user.name}</div>
                <div className="text-ink-2 text-[10px]">Lvl {user.level} · {user.xp.toLocaleString()} XP</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}