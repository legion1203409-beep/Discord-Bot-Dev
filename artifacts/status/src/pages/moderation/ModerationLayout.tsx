import { Link, useLocation } from "wouter";
import { ShieldAlert, Settings, Shield, ScrollText, Users, Bot, History, BookOpen, LogOut, ChevronLeft, Hexagon, Activity, Swords, Zap, Key } from "lucide-react";
import { ReactNode, useState } from "react";
import { useSession, useActiveGuild } from "../../hooks/use-moderation-api";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

export function ModerationLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { session, loading, error, login, logout, retry } = useSession();
  const { guildId, setGuildId, guilds } = useActiveGuild();
  const { toast } = useToast();
  
  const [code, setCode] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  if (loading) {
    return <div className="min-h-[100dvh] bg-background flex items-center justify-center text-muted-foreground">Se încarcă consola operatorului...</div>;
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-4">
        <div className="text-destructive mb-4"><ShieldAlert className="w-12 h-12" /></div>
        <h2 className="text-xl font-bold mb-2">Eroare de conexiune</h2>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          Oracolul nu poate fi contactat momentan ({error.message}). <br/>
          Acest lucru se poate întâmpla din cauza unei reporniri sau a unei probleme de rețea.
        </p>
        <Button onClick={() => retry()} className="gap-2">
          Reîncearcă conexiunea
        </Button>
      </div>
    );
  }

  if (!session?.authenticated) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border border-border p-8 rounded-xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <Hexagon className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">Autentificare Operator</h1>
          <p className="text-muted-foreground text-center text-sm mb-6">
            Introdu codul generat pe server cu comanda <strong className="text-foreground">/moderare</strong>.
            Codul este de unică folosință și expiră scurt timp de la generare.
          </p>
          
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!code) return;
            try {
              setIsLoggingIn(true);
              await login(code);
            } catch (err: any) {
              toast({ variant: "destructive", title: "Autentificare eșuată", description: err.message });
            } finally {
              setIsLoggingIn(false);
            }
          }} className="space-y-4">
            <div>
              <Input 
                placeholder="Ex: a1b2c3d4e5f6..." 
                value={code} 
                onChange={e => setCode(e.target.value)} 
                className="font-mono text-center tracking-widest text-lg py-6"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoggingIn || !code}>
              {isLoggingIn ? "Se verifică..." : "Accesează Consola"}
            </Button>
          </form>
          
          <div className="mt-8 pt-4 border-t border-border text-center">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2">
              <ChevronLeft className="w-4 h-4" /> Întoarce-te pe pagina principală
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/moderare", icon: Activity, label: "Dashboard" },
    { href: "/moderare/automod", icon: Bot, label: "AutoMod & AI" },
    { href: "/moderare/protectie", icon: Shield, label: "Protecție Server" },
    { href: "/moderare/comenzi", icon: Zap, label: "Acțiuni Manuale" },
    { href: "/moderare/cazuri", icon: BookOpen, label: "Cazuri (Cases)" },
    { href: "/moderare/audit", icon: History, label: "Loguri & Audit" },
    { href: "/moderare/config", icon: Settings, label: "Configurare Generală" },
  ];

  const activeGuild = guilds.find(g => g.id === guildId);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex overflow-hidden dark">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col hidden md:flex shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-border gap-3">
          <Hexagon className="text-primary w-6 h-6 shrink-0" />
          <div className="flex flex-col overflow-hidden">
            <span className="font-bold text-sm tracking-wide truncate">ORACOLUL</span>
            <span className="text-[10px] text-muted-foreground font-mono tracking-widest truncate">CONSOLĂ MODERARE</span>
          </div>
        </div>
        
        <div className="px-4 py-4">
          <div className="text-[10px] font-mono tracking-wider text-muted-foreground mb-3 px-2">MENIU</div>
          <nav className="flex flex-col gap-1">
            {navItems.map(item => {
              const active = location === item.href || (item.href !== "/moderare" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    active 
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-border space-y-2">
          <div className="mb-4">
            <div className="text-[10px] font-mono tracking-wider text-muted-foreground mb-2 px-2">SERVER CURENT</div>
            <Select value={guildId || ""} onValueChange={setGuildId}>
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder="Selectează server" />
              </SelectTrigger>
              <SelectContent>
                {guilds.map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Link href="/" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md transition-colors hover:bg-secondary">
            <ChevronLeft className="w-4 h-4" />
            Pagina Principală
          </Link>
          <button 
            onClick={() => logout()}
            className="flex w-full items-center gap-3 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Deconectare
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-border bg-background flex items-center justify-between px-6 shrink-0 md:hidden">
          <div className="flex items-center gap-2">
             <Hexagon className="text-primary w-5 h-5" />
             <span className="font-bold text-sm">ORACOLUL</span>
          </div>
          <button onClick={() => logout()} className="text-muted-foreground">
            <LogOut className="w-5 h-5" />
          </button>
        </header>
        
        <div className="flex-1 overflow-auto p-4 sm:p-6 md:p-8">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
