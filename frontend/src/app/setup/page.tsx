"use client";
import { useState, useCallback } from "react";
import { CheckCircle, Circle, Copy, ExternalLink, ChevronRight, Zap, RefreshCw, AlertCircle } from "lucide-react";

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="relative">
      {label && <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 font-mono">{label}</p>}
      <div className="bg-gray-950 border border-gray-700 rounded-xl p-4 pr-12 overflow-x-auto">
        <pre className="text-sm text-green-300 font-mono whitespace-pre-wrap">{code}</pre>
      </div>
      <button onClick={copy} className="absolute top-3 right-3 p-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white transition-colors">
        {copied ? <CheckCircle size={13} className="text-green-400" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function Info({ title, children, v = "info" }: { title: string; children: React.ReactNode; v?: "info"|"warn"|"success" }) {
  const colors = { info:"border-l-blue-500 bg-blue-500/5", warn:"border-l-yellow-500 bg-yellow-500/5", success:"border-l-green-500 bg-green-500/5" };
  const tc     = { info:"text-blue-300", warn:"text-yellow-300", success:"text-green-300" };
  return (
    <div className={`border-l-4 rounded-r-xl px-4 py-3 ${colors[v]}`}>
      <p className={`text-xs font-semibold mb-1 ${tc[v]}`}>{title}</p>
      <div className="text-xs text-gray-400 space-y-0.5">{children}</div>
    </div>
  );
}

const DEPLOY_CMD = `# Run ALL of this in Google Cloud Shell (shell.cloud.google.com)

# 1. Set your project
gcloud config set project YOUR_PROJECT_ID

# 2. Clone your fork
git clone https://github.com/YOUR_GITHUB_USERNAME/gemini-cx-agent
cd gemini-cx-agent

# 3. Enable APIs
gcloud services enable run.googleapis.com aiplatform.googleapis.com \\
  firestore.googleapis.com cloudbuild.googleapis.com

# 4. Create Firestore
gcloud firestore databases create --region=nam5 2>/dev/null || true

# 5. Deploy backend
gcloud run deploy gemini-cx-backend --source ./backend \\
  --region us-central1 --allow-unauthenticated \\
  --memory 1Gi --cpu 2 \\
  --set-env-vars "GCP_PROJECT=$(gcloud config get-value project),GCP_LOCATION=us-central1"

# 6. Grant permissions
SA=$(gcloud run services describe gemini-cx-backend \\
  --region us-central1 --format='value(spec.template.spec.serviceAccountName)')
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \\
  --member="serviceAccount:\${SA}" --role="roles/aiplatform.user"
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \\
  --member="serviceAccount:\${SA}" --role="roles/datastore.user"

# 7. Print your WebSocket URL (copy this!)
SERVICE=$(gcloud run services describe gemini-cx-backend \\
  --region us-central1 --format='value(status.url)')
echo "Your WebSocket URL: wss://\$(echo \$SERVICE | sed 's|https://||')/ws"`;

export default function SetupPage() {
  const [step, setStep]           = useState(0);
  const [wsUrl, setWsUrl]         = useState("");
  const [healthStatus, setHealth] = useState<"idle"|"checking"|"ok"|"error">("idle");

  const checkHealth = useCallback(async () => {
    if (!wsUrl) return;
    setHealth("checking");
    try {
      const url = wsUrl.replace(/^wss?:\/\//, "https://").replace("/ws", "");
      const r   = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) { setHealth("ok"); setTimeout(() => setStep(3), 700); }
      else setHealth("error");
    } catch { setHealth("error"); }
  }, [wsUrl]);

  const wsDisplay = wsUrl || "wss://gemini-cx-backend-xxxxxxxx-uc.a.run.app/ws";

  const STEPS = [
    { title: "Create Accounts",     sub: "GCP · GitHub · Vercel" },
    { title: "Deploy to Cloud Run", sub: "One command in Cloud Shell" },
    { title: "Verify Backend",      sub: "Health check" },
    { title: "Deploy to Vercel",    sub: "Frontend live URL" },
    { title: "Test Your Store",     sub: "Shop, talk to Aria, checkout" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center text-sm">🌿</div>
            <div>
              <h1 className="text-sm font-bold">Bloom & Grow AI — Setup Wizard</h1>
              <p className="text-[10px] text-gray-500">Zero local install · ~10 minutes</p>
            </div>
          </div>
          <a href="/" className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1">
            Go to store <ChevronRight size={12} />
          </a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 flex gap-8">
        {/* Step list */}
        <div className="w-48 shrink-0 space-y-1">
          {STEPS.map((s, i) => (
            <button key={i} onClick={() => setStep(i)}
              className={`w-full text-left px-3 py-3 rounded-xl flex items-start gap-3 transition-all ${step === i ? "bg-green-600/15 border border-green-500/30" : "hover:bg-gray-800/50 border border-transparent"}`}>
              <div className="mt-0.5 shrink-0">
                {i < step ? <CheckCircle size={15} className="text-green-400" />
                 : step === i ? <div className="w-3.5 h-3.5 rounded-full border-2 border-green-400 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-green-400" /></div>
                 : <Circle size={15} className="text-gray-600" />}
              </div>
              <div>
                <p className={`text-xs font-semibold ${step === i ? "text-white" : "text-gray-400"}`}>{s.title}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{s.sub}</p>
              </div>
            </button>
          ))}
          {/* Progress */}
          <div className="pt-4 px-3">
            <div className="flex justify-between text-[10px] text-gray-600 mb-1">
              <span>Progress</span><span>{Math.round(step / (STEPS.length - 1) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${step / (STEPS.length - 1) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* ── Step 0: Accounts ─────────────────────────── */}
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold">Create Your Three Accounts</h2>
                <p className="text-sm text-gray-400 mt-1">All free. GCP needs billing enabled (you get $300 free credit).</p>
              </div>
              {[
                { num:"1", name:"Google Cloud", url:"https://console.cloud.google.com", steps:["Sign in at console.cloud.google.com","Click project dropdown → New Project → name it bloom-grow-ai","Note your Project ID (e.g. bloom-grow-ai-123456)","Go to Billing → Link a billing account"] },
                { num:"2", name:"GitHub",        url:"https://github.com",              steps:["Go to github.com and sign up (free)","Go to the gemini-cx-agent repo → click Fork → Create fork"] },
                { num:"3", name:"Vercel",         url:"https://vercel.com",             steps:["Go to vercel.com → Sign Up → Continue with GitHub","Complete onboarding — Hobby plan is free"] },
              ].map(acc => (
                <div key={acc.num} className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-green-600/20 border border-green-500/30 text-green-300 text-xs font-bold flex items-center justify-center">{acc.num}</div>
                      <h3 className="text-sm font-semibold text-white">{acc.name}</h3>
                    </div>
                    <a href={acc.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300">Open <ExternalLink size={10}/></a>
                  </div>
                  <ol className="space-y-1.5">
                    {acc.steps.map((s, i) => (
                      <li key={i} className="flex gap-2 text-xs text-gray-300">
                        <span className="text-gray-600 font-mono shrink-0 mt-0.5">{i+1}.</span>{s}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
              <button onClick={() => setStep(1)} className="w-full py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white font-semibold text-sm transition-colors">
                I have all three accounts → Continue
              </button>
            </div>
          )}

          {/* ── Step 1: Cloud Run ────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold">Deploy Backend to Cloud Run</h2>
                <p className="text-sm text-gray-400 mt-1">Open <strong className="text-white">shell.cloud.google.com</strong> (free browser terminal) and paste this command block.</p>
              </div>
              <Info title="Cloud Shell = free Linux terminal in your browser" v="info">
                <p>Go to shell.cloud.google.com or click the {">"}{"{}"} icon in the GCP Console top bar. No install needed.</p>
              </Info>
              <CodeBlock label="Paste all at once in Cloud Shell" code={DEPLOY_CMD} />
              <Info title="This takes ~3 minutes" v="warn">
                <p>Cloud Build builds your Docker image remotely. When complete you'll see: <strong className="text-yellow-200">Your WebSocket URL: wss://...run.app/ws</strong></p>
                <p className="mt-1">Copy that URL — you need it in Step 3.</p>
              </Info>
              <button onClick={() => setStep(2)} className="w-full py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white font-semibold text-sm transition-colors">
                Deployment finished → Continue
              </button>
            </div>
          )}

          {/* ── Step 2: Verify ───────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold">Verify the Backend</h2>
                <p className="text-sm text-gray-400 mt-1">Paste your WebSocket URL to confirm the backend is running.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300">Your WebSocket URL</label>
                <div className="flex gap-2">
                  <input value={wsUrl} onChange={e => setWsUrl(e.target.value.trim())}
                    placeholder="wss://gemini-cx-backend-xxxxxxxx-uc.a.run.app/ws"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500 font-mono" />
                  <button onClick={checkHealth} disabled={!wsUrl || healthStatus === "checking"}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                    {healthStatus === "checking" ? <><RefreshCw size={14} className="animate-spin"/>Checking…</> : <><Zap size={14}/>Check</>}
                  </button>
                </div>
                <p className="text-[11px] text-gray-600">Must start with wss:// and end with /ws</p>
              </div>
              {healthStatus === "ok"    && <Info title="Backend is healthy!" v="success"><p>HTTP 200 — your Cloud Run service is running. Moving to Vercel setup…</p></Info>}
              {healthStatus === "error" && <Info title="Cannot reach backend" v="warn"><p>Check the URL starts with wss:// and ends with /ws. If just deployed, wait 30 seconds and retry.</p></Info>}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-300">Copy this for Vercel Step 4:</p>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-green-300 truncate">{wsDisplay}</code>
                  <button onClick={() => navigator.clipboard.writeText(wsDisplay)} className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white"><Copy size={12}/></button>
                </div>
              </div>
              <button onClick={() => setStep(3)} className="w-full py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white font-semibold text-sm transition-colors">
                {healthStatus === "ok" ? "Verified → Continue" : "Skip → Continue"}
              </button>
            </div>
          )}

          {/* ── Step 3: Vercel ───────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold">Deploy Frontend to Vercel</h2>
                <p className="text-sm text-gray-400 mt-1">~2 minutes. No CLI needed.</p>
              </div>
              {[
                { n:"1", title:"Go to vercel.com/new", body:'Click "Add New Project"', link:"https://vercel.com/new", linkText:"Open Vercel" },
                { n:"2", title:"Import your gemini-cx-agent fork", body:"Find it in the list and click Import" },
                { n:"3", title:'Set Root Directory to: frontend', body:'Find Root Directory → click Edit → type "frontend" → confirm', important: true },
                { n:"4", title:"Add environment variable", body:"", env: true },
                { n:"5", title:"Click Deploy", body:"Build takes ~90 seconds. You get a live URL like: https://gemini-cx-agent.vercel.app" },
              ].map(s => (
                <div key={s.n} className={`flex gap-3 p-4 rounded-xl border ${s.important ? "bg-yellow-500/5 border-yellow-500/20" : "bg-gray-900/60 border-gray-800"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${s.important ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30" : "bg-gray-800 text-gray-400 border border-gray-700"}`}>{s.n}</div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-semibold ${s.important ? "text-yellow-200" : "text-white"}`}>{s.title}</p>
                      {"link" in s && s.link && <a href={s.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-green-400">{s.linkText} <ExternalLink size={10}/></a>}
                    </div>
                    {s.body && <p className="text-xs text-gray-400">{s.body}</p>}
                    {"env" in s && s.env && (
                      <div className="bg-gray-950 border border-gray-700 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-gray-500 w-36 shrink-0">Variable Name:</span>
                          <code className="text-[11px] font-mono text-green-300">NEXT_PUBLIC_WS_URL</code>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-gray-500 w-36 shrink-0">Value:</span>
                          <code className="text-[11px] font-mono text-yellow-300 truncate flex-1">{wsDisplay}</code>
                          <button onClick={() => navigator.clipboard.writeText(wsDisplay)} className="shrink-0 p-1 rounded text-gray-500 hover:text-white"><Copy size={10}/></button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={() => setStep(4)} className="w-full py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white font-bold text-sm transition-colors">
                Vercel deployed! → Test my store
              </button>
            </div>
          )}

          {/* ── Step 4: Test ────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold">Your Store is Live! 🎉</h2>
                <p className="text-sm text-gray-400 mt-1">Open your Vercel URL in Chrome or Edge and run these tests.</p>
              </div>
              <Info title="Use Chrome or Edge" v="warn"><p>AudioWorklet for voice requires Chrome or Edge. Safari has limited support.</p></Info>
              {[
                { title:"1. Open the homepage", steps:["Open your Vercel URL","You should see the Bloom & Grow store with category cards","A small circular button appears in the bottom-right — that's Aria"] },
                { title:"2. Start a voice call", steps:["Click the green orb button in the bottom-right","Allow microphone access","The agent panel opens on the right side — you hear Aria greet you"] },
                { title:"3. Voice + shopping", steps:["Say: 'I need soil for flowering plants'","The agent panel shows product recommendations","Say: 'Add the Bloom Booster to my cart'","Cart icon in nav shows a badge"] },
                { title:"4. Camera identification", steps:["In the agent panel, say: 'Can you look at this plant?'","The panel asks to access your camera — click Yes","Hold up any plant — Aria identifies it and suggests care products"] },
                { title:"5. Product pages", steps:["Navigate to /shop","Click any product","The agent panel stays open and shows recommendations for that product category"] },
                { title:"6. Manager dashboard", steps:["Navigate to /manager","See session metrics and any pending discount approvals","When the agent requests a discount, approve it here"] },
              ].map((test, i) => (
                <div key={i} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-semibold text-white">{test.title}</p>
                  <ol className="space-y-1">
                    {test.steps.map((s, j) => (
                      <li key={j} className="flex gap-2 text-xs text-gray-400">
                        <span className="text-gray-600 font-mono shrink-0">{j+1}.</span>{s}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
              <div className="bg-green-600/10 border border-green-500/20 rounded-2xl p-5 text-center space-y-3">
                <p className="text-sm font-bold text-white">Everything is deployed and running</p>
                <a href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white font-semibold text-sm transition-colors">
                  Open Bloom & Grow Store <ChevronRight size={14}/>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
