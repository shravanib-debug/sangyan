"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { login, signup } from "../../../app/auth/actions";

type AuthMode = "signin" | "signup";

const steps = [
  { number: "01", title: "Pause", body: "Break the impulse.", icon: "Ⅱ" },
  { number: "02", title: "Check", body: "Compare the decision with your rules.", icon: "✓" },
  { number: "03", title: "Decide", body: "Move forward intentionally.", icon: "↗" }
];

function Reveal({ children, className = "", id }: Readonly<{ children: React.ReactNode; className?: string; id?: string }>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        element.classList.add("is-visible");
        observer.disconnect();
      }
    }, { threshold: 0.15 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} id={id} className={`landing-reveal ${className}`}>{children}</div>;
}

function AuthPanel({ mode, onModeChange, onClose }: Readonly<{ mode: AuthMode; onModeChange: (mode: AuthMode) => void; onClose: () => void }>) {
  const [result, formAction, pending] = useActionState(
    async (_previous: { error: string | null }, formData: FormData) => {
      const response = mode === "signup" ? await signup(formData) : await login(formData);
      return response ? { error: response.error } : { error: null };
    },
    { error: null }
  );

  return (
    <div className="landing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="landing-auth" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="landing-modal-close" onClick={onClose} aria-label="Close authentication dialog">×</button>
        <div className="landing-auth-mark">T</div>
        <p className="landing-kicker">THEHRAV</p>
        <h2 id="auth-title">{mode === "signup" ? "Start thinking differently." : "Welcome back."}</h2>
        <p>{mode === "signup" ? "Create your account and build calmer decision habits." : "Let’s make your next decision a little calmer."}</p>
        <form className="landing-auth-form" action={formAction}>
          {mode === "signup" && <label>Name<input name="displayName" type="text" required maxLength={80} autoComplete="name" placeholder="Your name" /></label>}
          <label>Email<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label>
          <label>Password<input name="password" type="password" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="At least 8 characters" /></label>
          {mode === "signin" && <div className="landing-auth-options"><label className="landing-checkbox"><input type="checkbox" /> Remember me</label><button type="button">Forgot password?</button></div>}
          {result.error && <p className="landing-auth-error" role="alert">{result.error}</p>}
          <button className="landing-primary-button" disabled={pending}>{pending ? "Please wait…" : mode === "signup" ? "Create account" : "Continue"} <span>→</span></button>
        </form>
        <div className="landing-auth-divider"><span>or</span></div>
        <button className="landing-google-button" type="button">Continue with Google</button>
        <p className="landing-auth-switch">{mode === "signup" ? "Already have an account?" : "Don’t have an account?"} <button onClick={() => onModeChange(mode === "signup" ? "signin" : "signup")}>{mode === "signup" ? "Sign in" : "Create one"}</button></p>
      </section>
    </div>
  );
}

export function LandingPage() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [activeFlow, setActiveFlow] = useState("Pause");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main className="landing-page">
      <div className="landing-noise" aria-hidden="true"><span>+</span><span>%</span><span>↗</span><span>−</span><span>•</span><span>₹</span></div>
      <nav className="landing-nav">
        <Link href="/" className="landing-brand"><span>T</span> THEHRAV</Link>
        <div className="landing-nav-links"><a href="#how-it-works">How it works</a><a href="#simulator">Simulator</a><a href="#journal">Journal</a><a href="/about">About</a></div>
        <div className="landing-nav-actions"><button onClick={() => setAuthMode("signin")}>Sign in</button><button className="landing-nav-cta" onClick={() => setAuthMode("signup")}>Start your journey <span>→</span></button></div>
        <button className="landing-menu" aria-label={menuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "×" : "☰"}</button>
      </nav>
      {menuOpen && <div className="landing-mobile-menu"><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#simulator" onClick={() => setMenuOpen(false)}>Simulator</a><a href="#journal" onClick={() => setMenuOpen(false)}>Journal</a><a href="/about">About</a><button onClick={() => { setMenuOpen(false); setAuthMode("signin"); }}>Sign in</button><button className="landing-primary-button" onClick={() => { setMenuOpen(false); setAuthMode("signup"); }}>Start your journey <span>→</span></button></div>}

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-kicker landing-entrance">THEHRAV / A CALMER WAY TO DECIDE</p>
          <h1 className="landing-entrance landing-delay-1">Make calmer decisions.<br /><em>Build better habits.</em></h1>
          <p className="landing-hero-description landing-entrance landing-delay-2">A quiet moment between impulse and action. THEHRAV helps you pause, reflect, and understand the consequences before your next investment decision.</p>
          <div className="landing-hero-actions landing-entrance landing-delay-3"><button className="landing-primary-button" onClick={() => setAuthMode("signup")}>Start your journey <span>→</span></button><a className="landing-text-button" href="#how-it-works">See how it works <span>↓</span></a></div>
          <div className="landing-trust landing-entrance landing-delay-3"><span className="landing-trust-avatars"><i>A</i><i>R</i><i>K</i></span><span>Built for more intentional decisions</span></div>
        </div>
        <div className="landing-hero-visual landing-entrance landing-delay-2">
          <div className="landing-orbit orbit-one" /><div className="landing-orbit orbit-two" />
          <article className="landing-decision-card">
            <div className="landing-card-top"><span className="landing-kicker">YOUR NEXT DECISION</span><span className="landing-card-menu">•••</span></div>
            <h2>Should I make<br />this investment?</h2>
            <div className="landing-decision-amount">₹5,000 <span>considering</span></div>
            <div className="landing-decision-details"><span><small>Risk</small><b className="amber-text">Moderate</b></span><span><small>Pact</small><b className="green-text">✓ Within limits</b></span><span><small>Cooldown</small><b>None</b></span></div>
            <button className="landing-card-button" onClick={() => setAuthMode("signup")}>Reflect first <span>→</span></button>
            <div className="landing-card-foot"><span className="landing-pulse" /> Your plan is ready when you are.</div>
          </article>
          <div className="landing-float-stat"><strong>92%</strong><span>pact aligned</span><i>↗</i></div>
        </div>
      </section>

      <section className="landing-flow-section">
        <div className="landing-flow-label"><span>THE THEHRAV METHOD</span><b>↓</b></div>
        <div className="landing-flow">
          <div className="landing-flow-line" />
          {["Decision", "Pause", "Reflect", "Act"].map((item, index) => <button key={item} className={activeFlow === item ? "active" : ""} onMouseEnter={() => setActiveFlow(item)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong>{index < 3 && <i>↓</i>}</button>)}
          <p>{activeFlow === "Pause" ? "Take a moment before reacting." : activeFlow === "Reflect" ? "Check your rules and previous behavior." : activeFlow === "Act" ? "Make the decision intentionally." : "Notice the decision before it becomes action."}</p>
        </div>
      </section>

      <Reveal className="landing-section" ><div className="landing-section-heading"><p className="landing-kicker">A SIMPLE PRACTICE</p><h2>Before you act.<br /><em>Take a moment.</em></h2><p>Good decisions rarely need to be rushed. THEHRAV gives you a repeatable way to make space for your better judgment.</p></div><div className="landing-step-grid" id="how-it-works">{steps.map((step) => <article className="landing-step-card" key={step.number}><span className="landing-step-number">{step.number}</span><div className="landing-step-icon">{step.icon}</div><h3>{step.title}</h3><p>{step.body}</p><span className="landing-step-arrow">↗</span></article>)}</div></Reveal>

      <Reveal className="landing-feature landing-feature-green" id="simulator"><div className="landing-feature-copy"><p className="landing-kicker">CONSEQUENCE SIMULATOR</p><h2>See the decision<br /><em>before you make it.</em></h2><p>Understand the shape of a loss, the road back, and what your pact can absorb. Clarity changes the choice.</p><a href="/simulator" className="landing-text-button">Explore the simulator <span>→</span></a></div><div className="landing-simulator-card"><div className="landing-card-top"><span className="landing-kicker">SCENARIO PREVIEW</span><span className="green-text">LIVE</span></div><div className="landing-simulator-value"><span>Investment</span><strong>₹5,000</strong></div><div className="landing-mini-chart"><i /><i /><i /><i /><i /><i /><b>−₹1,200</b></div><div className="landing-simulator-meta"><span><small>Potential downside</small><strong>−₹1,200</strong></span><span><small>Recovery</small><strong>3.4 weeks</strong></span><span><small>Pact impact</small><strong className="green-text">✓ Within limits</strong></span></div></div></Reveal>

      <Reveal className="landing-feature landing-feature-split"><div className="landing-pact-preview"><div className="landing-card-top"><span className="landing-kicker">MY PACT</span><span>•••</span></div><div className="landing-pact-ring"><strong>92%</strong><span>adherence</span></div><div className="landing-pact-rules"><span><b>Daily loss limit</b><strong>₹2,000</strong></span><span><b>Trades per day</b><strong>3</strong></span><span><b>Cooldown</b><strong>10 min</strong></span></div></div><div className="landing-feature-copy"><p className="landing-kicker">YOUR RULES, YOUR GUARDRAILS</p><h2>Make your plan<br /><em>part of the decision.</em></h2><p>Your pact is not a restriction. It is the calm voice you chose before the pressure arrived.</p><a href="/pact" className="landing-text-button">Build your pact <span>→</span></a></div></Reveal>

      <Reveal className="landing-journal-feature" id="journal"><div className="landing-section-heading"><p className="landing-kicker">DECISION JOURNAL</p><h2>Notice your patterns.<br /><em>Change the next one.</em></h2></div><article className="landing-journal-card"><div><span className="landing-kicker">TODAY’S DECISION / 10:24 AM</span><h3>“I considered increasing<br />my position.”</h3><p>I wanted to recover a previous loss.</p></div><div className="landing-journal-reflection"><span>REFLECTION</span><strong>Paused for 8 minutes.</strong><small>Stayed within my pact. That counts.</small><b>✓ Aligned</b></div></article></Reveal>

      <Reveal className="landing-final-cta"><p className="landing-kicker">A QUIETER WAY FORWARD</p><h2>Your next decision<br /><em>doesn’t need to be rushed.</em></h2><p>Build a system that helps you pause, reflect, and act with intention.</p><button className="landing-primary-button" onClick={() => setAuthMode("signup")}>Start your journey <span>→</span></button></Reveal>

      <footer className="landing-footer"><Link href="/" className="landing-brand"><span>T</span> THEHRAV</Link><p>For more intentional decisions.</p><div><a href="#how-it-works">How it works</a><a href="/about">About</a><a href="/login">Sign in</a></div><small>© 2026 THEHRAV. A pause before action.</small></footer>
      {authMode && <AuthPanel mode={authMode} onModeChange={setAuthMode} onClose={() => setAuthMode(null)} />}
    </main>
  );
}
