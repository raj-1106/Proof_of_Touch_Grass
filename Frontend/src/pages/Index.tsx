import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sprout, ExternalLink, X, CheckCircle, XCircle, Clock,
  Shield, Coins, Vote, ImageIcon, Leaf, Loader2, AlertCircle, Camera, Upload, Trash2
} from "lucide-react";
import heroGrass from "@/assets/hero-grass.jpg";
import { WalletButton } from "@/components/WalletConnect";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useReadContracts,
  useAccount,
  useSwitchChain,
  useChainId,
  usePublicClient,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import { CONTRACT_ADDRESS, CONTRACT_ABI, USDC_ADDRESS, USDC_ABI, STAKE_AMOUNT } from "@/lib/contract";

// ── Types ──────────────────────────────────────────────────────────────────────

type ChallengeStatus = "active" | "voting" | "resolved_success" | "resolved_fail" | "expired";

interface Challenge {
  id: number;
  creator: string;
  deadline: number;
  votingDeadline: number;
  metadataCID: string;
  proofCID: string;
  approveVotes: number;
  rejectVotes: number;
  proofSubmitted: boolean;
  resolved: boolean;
  success: boolean;
}

interface ChallengeMeta {
  name: string;
  description: string;
  image?: string; // resolved http(s) URL
}

// ── IPFS helpers ───────────────────────────────────────────────────────────────

const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

const PINATA_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI5ZGQ3ODJiOS1hNmMzLTQ0NGItOTRhYi1iMWMwZTQyYzMyMzMiLCJlbWFpbCI6InJsYXRoaWdyYTExQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiJiNDQzNmMyNmNmNjRiNTJlY2I4OSIsInNjb3BlZEtleVNlY3JldCI6IjA2Y2VhNjM3M2FlNGFkNTBlYzNlYTU4MzQwZDhjZTgxMDBhYTFjNjM3N2VmOGNiZDQ5MTk0MGFiN2ZkNGQ4ZTIiLCJleHAiOjE4MDY3NTU5MDl9.lifu39uwq83t6V725c_MctgYyyTRd9VajAC6wrun8MM";

async function uploadJSONToIPFS(obj: object): Promise<string> {
  const json = JSON.stringify(obj);
  const blob = new Blob([json], { type: "application/json" });
  const form = new FormData();
  form.append("file", blob, "metadata.json");

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: form,
  });

  if (!res.ok) throw new Error(`Metadata upload error ${res.status}`);
  const data = await res.json();
  return data.IpfsHash as string;
}

async function uploadImageToIPFS(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name);

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: form,
  });

  if (!res.ok) throw new Error(`Image upload error ${res.status}`);
  const data = await res.json();
  return data.IpfsHash as string;
}

// Check if a string looks like a valid IPFS CID
function isValidCID(cid: string): boolean {
  if (!cid || cid.length < 10) return false;
  return cid.startsWith("Qm") || cid.startsWith("bafy") || cid.startsWith("bafk");
}

// Resolve an ipfs:// or bare-CID/path reference to an https Pinata gateway URL
function resolveIpfsUrl(ref: string | undefined | null): string | undefined {
  if (!ref || typeof ref !== "string") return undefined;
  const trimmed = ref.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("ipfs://")) return `${IPFS_GATEWAY}${trimmed.slice("ipfs://".length)}`;
  if (isValidCID(trimmed.split("/")[0])) return `${IPFS_GATEWAY}${trimmed}`;
  return undefined;
}

const FALLBACK_META: ChallengeMeta = { name: "Unnamed Challenge", description: "" };

// Fetch metadata JSON from IPFS CID. Always returns a ChallengeMeta — falls
// back to "Unnamed Challenge" if the fetch or parse fails so the UI never
// shows a blank card.
const metaCache: Record<string, ChallengeMeta> = {};
async function fetchMetaFromIPFS(cid: string): Promise<ChallengeMeta> {
  if (!isValidCID(cid)) return FALLBACK_META;
  if (metaCache[cid]) return metaCache[cid];
  try {
    const url = `${IPFS_GATEWAY}${cid}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const json = await res.json();
    const meta: ChallengeMeta = {
      name: (typeof json.name === "string" && json.name.trim()) || "Unnamed Challenge",
      description: typeof json.description === "string" ? json.description : "",
      image: resolveIpfsUrl(json.image),
    };
    metaCache[cid] = meta;
    return meta;
  } catch (e) {
    console.warn("metadata fetch failed for", cid, e);
    return FALLBACK_META;
  }
}

// Convert CID to a displayable image URL (only if valid CID)
function ipfsImageUrl(cid: string): string | null {
  if (!isValidCID(cid)) return null;
  return `${IPFS_GATEWAY}${cid}`;
}

// ── Hook: resolve metadataCIDs to names/descriptions ─────────────────────────

function useChallengesMeta(challenges: Challenge[]) {
  const [meta, setMeta] = useState<Record<number, ChallengeMeta>>({});
  // Track by CID string (not ID) so that when a real CID arrives after the
  // initial empty-string render, we still fetch — without duplicate requests.
  const fetchedCIDs = useRef<Set<string>>(new Set());

  useEffect(() => {
    challenges.forEach((c) => {
      // CID not yet loaded from event logs — skip rather than setting fallback,
      // because the effect will re-run when the CID arrives.
      if (!c.metadataCID) return;
      // Already requested this exact CID.
      if (fetchedCIDs.current.has(c.metadataCID)) return;
      fetchedCIDs.current.add(c.metadataCID);
      fetchMetaFromIPFS(c.metadataCID).then((m) => {
        setMeta((prev) => ({ ...prev, [c.id]: m }));
      });
    });
  }, [challenges]);

  return meta;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getChallengeStatus(c: Challenge): ChallengeStatus {
  if (c.resolved) return c.success ? "resolved_success" : "resolved_fail";
  if (c.proofSubmitted && c.votingDeadline > 0) {
    if (Date.now() <= c.votingDeadline) return "voting";
    return c.approveVotes > c.rejectVotes ? "resolved_success" : "resolved_fail";
  }
  if (Date.now() > c.deadline) return "expired";
  return "active";
}

function formatTimeLeft(deadline: number): string {
  const diff = deadline - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

function truncateAddr(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

// ── TxButton ─ reusable wagmi write + wait button ─────────────────────────────

type ContractArgs =
  | readonly [bigint]
  | readonly [bigint, string]
  | readonly [bigint, boolean]
  | readonly [bigint, string, `0x${string}`]
  | readonly [`0x${string}`];

interface TxButtonProps {
  label: string;
  pendingLabel: string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  args: ContractArgs;
  functionName: "createChallenge" | "submitProof" | "vote" | "resolve" | "claim" | "claimVoterReward";
  onSuccess?: () => void;
}

function TxButton({ label, pendingLabel, icon, className = "", disabled, args, functionName, onSuccess }: TxButtonProps) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const busy = isPending || isConfirming;

  const handleClick = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName, args } as any, { onSuccess });
  };

  return (
    <div className="space-y-2">
      <motion.button
        whileTap={{ scale: 0.97 }}
        disabled={disabled || busy}
        onClick={handleClick}
        className={`${className} flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
        {busy ? pendingLabel : label}
      </motion.button>
      {error && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-1.5 text-xs text-reject">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {(error as Error).message?.split("\n")[0]?.slice(0, 100) ?? "Transaction failed"}
        </motion.p>
      )}
      {isSuccess && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-xs text-approve font-medium">
          <CheckCircle className="w-3.5 h-3.5" /> Transaction confirmed!
        </motion.p>
      )}
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: ChallengeStatus }) => {
  const map: Record<ChallengeStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    active: { label: "Active", cls: "bg-approve-light text-approve border-approve/20", icon: <Sprout className="w-3 h-3" /> },
    voting: { label: "Voting", cls: "bg-pending-light text-pending border-pending/20", icon: <Vote className="w-3 h-3" /> },
    resolved_success: { label: "Success ✓", cls: "bg-approve-light text-approve border-approve/20", icon: <CheckCircle className="w-3 h-3" /> },
    resolved_fail: { label: "Failed ✗", cls: "bg-reject-light text-reject border-reject/20", icon: <XCircle className="w-3 h-3" /> },
    expired: { label: "Expired", cls: "bg-muted text-muted-foreground border-border", icon: <Clock className="w-3 h-3" /> },
  };
  const { label, cls, icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {icon} {label}
    </span>
  );
};

// ── Vote Bar ───────────────────────────────────────────────────────────────────

const VoteBar = ({ approve, reject }: { approve: number; reject: number }) => {
  const total = approve + reject;
  const pct = total > 0 ? Math.round((approve / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="text-approve font-medium">✓ {approve} approve</span>
        <span className="text-reject font-medium">{reject} reject ✗</span>
      </div>
      <div className={`h-2 rounded-full overflow-hidden ${total > 0 ? 'bg-reject' : 'bg-muted'}`}>
        <motion.div
          className="h-full bg-approve"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
};

// ── Challenge Card ────────────────────────────────────────────────────────────

const ChallengeCard = ({ challenge, meta, onClick, highlight }: {
  challenge: Challenge; meta?: ChallengeMeta; onClick: () => void; highlight?: boolean;
}) => {
  const status = getChallengeStatus(challenge);
  const timeRef = status === "voting" ? challenge.votingDeadline : challenge.deadline;
  const proofImageUrl = challenge.proofCID ? ipfsImageUrl(challenge.proofCID) : null;
  const thumbUrl = proofImageUrl || meta?.image || null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, boxShadow: highlight ? "0 16px 40px -8px hsl(38 90% 50% / 0.3)" : "0 16px 40px -8px hsl(142 40% 20% / 0.2)" }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`bg-card rounded-2xl border cursor-pointer overflow-hidden shadow-card group ${
        highlight ? "border-pending/40 ring-2 ring-pending/20" : "border-border"
      }`}
    >
      <div className={`h-1.5 w-full ${
        status === "active" ? "bg-gradient-primary"
        : status === "voting" ? "bg-gradient-to-r from-pending to-yellow-400"
        : status === "resolved_success" ? "bg-approve"
        : "bg-reject"
      }`} />

      {/* Image thumbnail — proof photo if submitted, else metadata cover image */}
      {thumbUrl && (
        <div className="h-32 overflow-hidden relative bg-muted">
          <img
            src={thumbUrl}
            alt={proofImageUrl ? "Proof" : "Challenge"}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
        </div>

      )}

      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 pr-2">
            <p className="text-xs text-muted-foreground font-medium mb-0.5">#{challenge.id} · {truncateAddr(challenge.creator)}</p>
            <p className="text-base font-bold text-foreground font-display truncate">
              {meta?.name || "Unnamed Challenge"}
            </p>
            {meta?.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{meta.description}</p>
            )}
          </div>
          <StatusBadge status={status} />
        </div>

        {(status === "voting" || status === "resolved_success" || status === "resolved_fail") && (
          <div className="mb-3">
            <VoteBar approve={challenge.approveVotes} reject={challenge.rejectVotes} />
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{formatTimeLeft(timeRef)}</span>
          </div>
          {highlight ? (
            <span className="text-xs text-pending font-bold animate-pulse">Vote now →</span>
          ) : (
            <span className="text-xs text-primary font-semibold group-hover:underline">View →</span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ── Image Upload Input ────────────────────────────────────────────────────────

function ImageUpload({ onFile }: { onFile: (file: File, preview: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setPreview(url);
      onFile(file, url);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all overflow-hidden ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 bg-secondary/30"
        }`}
      >
        {preview ? (
          <div className="relative">
            <img src={preview} alt="Proof preview" className="w-full h-48 object-cover rounded-xl" />
            <div className="absolute inset-0 bg-foreground/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-xl">
              <p className="text-white text-sm font-semibold bg-foreground/60 px-3 py-1.5 rounded-lg">Change photo</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <Camera className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="text-sm font-semibold text-foreground">Drop your photo here</p>
            <p className="text-xs text-muted-foreground mt-1">or click to browse · JPG, PNG, WEBP</p>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {preview && (
        <p className="flex items-center gap-1.5 text-xs text-approve font-medium">
          <CheckCircle className="w-3.5 h-3.5" /> Photo ready — will be uploaded to IPFS
        </p>
      )}
    </div>
  );
}

// ── Challenge Detail Modal ────────────────────────────────────────────────────

const ChallengeModal = ({ challenge, meta, onClose, onVoted, onHide }: {
  challenge: Challenge; meta?: ChallengeMeta; onClose: () => void; onVoted?: () => void; onHide?: (id: number) => void;
}) => {
  const { address } = useAccount();
  const status = getChallengeStatus(challenge);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedCID, setUploadedCID] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isCreator = address?.toLowerCase() === challenge.creator.toLowerCase();

  const proofImageUrl = challenge.proofCID ? ipfsImageUrl(challenge.proofCID) : null;

  const { data: alreadyVoted, refetch: refetchVoted } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "hasVoted",
    args: [BigInt(challenge.id), address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });

  // rewardClaimed mapping is internal in the new contract; we optimistically
  // show the claim button and let the contract revert with AlreadyClaimed if so.
  const rewardClaimed = false;


  const votingEnded = challenge.votingDeadline > 0 && Date.now() > challenge.votingDeadline;

  const handleProofFile = (file: File, preview: string) => {
    setProofFile(file);
    setProofPreview(preview);
    setUploadedCID(null);
    setUploadError(null);
  };

  // Upload proof image to IPFS, then call submitProof on-chain
  const { writeContract: submitProofFn, data: submitHash, isPending: submitPending, error: submitError } = useWriteContract();
  const { isLoading: submitConfirming, isSuccess: submitConfirmed } = useWaitForTransactionReceipt({ hash: submitHash });

  const handleUploadAndSubmit = async () => {
    if (!proofFile || !address) return;
    setUploading(true);
    setUploadError(null);
    try {
      const cid = await uploadImageToIPFS(proofFile);
      setUploadedCID(cid);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      submitProofFn({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: "submitProof", args: [BigInt(challenge.id), cid] } as any);
    } catch (e) {
      setUploadError((e as Error).message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (submitConfirmed) {
      setTimeout(onClose, 1200);
    }
  }, [submitConfirmed]);

  const handleVoteSuccess = () => {
    refetchVoted();
    onVoted?.();
    setTimeout(onClose, 1200);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-card rounded-3xl border border-border shadow-elevated w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-xs text-muted-foreground font-medium mb-1">Challenge #{challenge.id} · {truncateAddr(challenge.creator)}</p>
              <h2 className="text-2xl font-bold font-display text-foreground leading-tight">
                {meta?.name || "Unnamed Challenge"}
              </h2>
              {meta?.description && (
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{meta.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <StatusBadge status={status} />
              {onHide && (
                <button onClick={() => { onHide(challenge.id); onClose(); }} title="Hide from frontend" className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-reject">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Proof image from IPFS */}
          {proofImageUrl && (
            <>
              <div className="mb-5 rounded-2xl overflow-hidden border border-border group cursor-zoom-in" onClick={() => setLightboxOpen(true)}>
                <div className="relative">
                  <img src={proofImageUrl} alt="Proof" className="w-full max-h-64 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }} />
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-all flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-foreground/70 text-background text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" /> Click to enlarge
                    </span>
                  </div>
                </div>
                <div className="px-4 py-2.5 bg-muted/40 flex items-center gap-2 text-xs text-muted-foreground">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Proof photo · stored on IPFS · visible to everyone · click to expand</span>
                </div>
              </div>

              {/* Lightbox */}
              <AnimatePresence>
                {lightboxOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-foreground/80 backdrop-blur-md"
                    onClick={() => setLightboxOpen(false)}
                  >
                    <motion.div
                      initial={{ scale: 0.85 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0.85 }}
                      transition={{ type: "spring", stiffness: 300, damping: 28 }}
                      className="relative max-w-3xl w-full"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <img src={proofImageUrl} alt="Proof fullsize" className="w-full max-h-[80vh] object-contain rounded-2xl shadow-elevated" />
                      <button
                        onClick={() => setLightboxOpen(false)}
                        className="absolute top-3 right-3 p-2 rounded-full bg-foreground/60 hover:bg-foreground/80 text-background transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <p className="text-center text-xs text-background/70 mt-3">Click outside or ✕ to close</p>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Stake info */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-primary/10 border border-primary/20 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
              <Coins className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Staked Amount</p>
              <p className="text-lg font-bold font-display text-foreground">1.00 USDC</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="p-3 rounded-xl bg-secondary/60 border border-border">
              <p className="text-xs text-muted-foreground mb-1">Challenge Deadline</p>
              <p className="text-sm font-semibold font-display">{formatTimeLeft(challenge.deadline)}</p>
            </div>
            <div className="p-3 rounded-xl bg-secondary/60 border border-border">
              <p className="text-xs text-muted-foreground mb-1">Voting Period</p>
              <p className="text-sm font-semibold font-display">
                {challenge.votingDeadline ? formatTimeLeft(challenge.votingDeadline) : "24h after proof"}
              </p>
            </div>
          </div>

          {/* Vote bar */}
          {(challenge.approveVotes + challenge.rejectVotes > 0 || status === "voting") && (
            <div className="mb-5">
              <p className="text-sm font-semibold font-display mb-3">Community Votes</p>
              <VoteBar approve={challenge.approveVotes} reject={challenge.rejectVotes} />
              <p className="text-xs text-muted-foreground mt-1">{challenge.approveVotes + challenge.rejectVotes} total votes</p>
            </div>
          )}

          {/* ── Submit Proof (creator only, active) */}
          {status === "active" && isCreator && !challenge.proofSubmitted && (
            <div className="space-y-4 pt-2">
              <div>
                <p className="text-sm font-semibold font-display mb-1">Submit Your Proof</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Upload your grass photo — it will be stored on IPFS so everyone can see it. Your proof CID is recorded on-chain.
                </p>
                <ImageUpload onFile={handleProofFile} />
              </div>

              {uploadedCID && (
                <p className="text-xs text-approve font-medium flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Uploaded! CID: {uploadedCID.slice(0, 16)}…
                </p>
              )}
              {uploadError && (
                <p className="text-xs text-reject flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> {uploadError}
                </p>
              )}
              {submitError && (
                <p className="text-xs text-reject flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> {(submitError as Error).message?.split("\n")[0]?.slice(0, 100)}
                </p>
              )}
              {submitConfirmed && (
                <p className="text-xs text-approve font-medium flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Proof submitted on-chain!
                </p>
              )}

              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={!proofFile || !address || uploading || submitPending || submitConfirming}
                onClick={handleUploadAndSubmit}
                className="w-full py-3 rounded-xl bg-gradient-primary text-primary-foreground font-semibold text-sm hover:shadow-glow flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading to IPFS…</>
                ) : submitPending || submitConfirming ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {submitConfirming ? "Confirming…" : "Submitting…"}</>
                ) : (
                  <><Upload className="w-4 h-4" /> Upload & Submit Proof</>
                )}
              </motion.button>
              {!proofFile && (
                <p className="text-xs text-muted-foreground text-center">Upload a photo first to enable submission.</p>
              )}
            </div>
          )}

          {/* Local proof preview (before upload) */}
          {status === "active" && isCreator && !challenge.proofSubmitted && proofPreview && !proofImageUrl && (
            <div className="mt-3 rounded-xl overflow-hidden border border-border">
              <img src={proofPreview} alt="Local preview" className="w-full max-h-48 object-cover" />
              <p className="text-xs text-muted-foreground px-3 py-2 bg-muted/40">Preview · will be uploaded to IPFS on submit</p>
            </div>
          )}

          {/* ── Vote (non-creator, voting open, not voted) */}
          {status === "voting" && !isCreator && !alreadyVoted && (
            <div className="space-y-3 pt-2">
              <div className="p-3 rounded-xl bg-pending-light border border-pending/20">
                <p className="text-sm font-semibold font-display text-pending mb-1">🗳️ Your vote is needed!</p>
                <p className="text-xs text-muted-foreground">Does the photo above show the challenger actually touched grass?</p>
              </div>
              <div className="grid grid-cols-2 gap-3 items-start">
                <TxButton
                  functionName="vote"
                  args={[BigInt(challenge.id), true]}
                  label="✓ Approve"
                  pendingLabel="Voting…"
                  icon={<CheckCircle className="w-4 h-4" />}
                  disabled={!address}
                  className="w-full py-3.5 rounded-xl bg-approve text-white font-bold text-sm hover:opacity-90 shadow-sm"
                  onSuccess={handleVoteSuccess}
                />
                <TxButton
                  functionName="vote"
                  args={[BigInt(challenge.id), false]}
                  label="✗ Reject"
                  pendingLabel="Voting…"
                  icon={<XCircle className="w-4 h-4" />}
                  disabled={!address}
                  className="w-full py-3.5 rounded-xl bg-reject text-white font-bold text-sm hover:opacity-90 shadow-sm"
                  onSuccess={handleVoteSuccess}
                />
              </div>
            </div>
          )}

          {alreadyVoted && status === "voting" && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-approve-light border border-approve/20 text-approve">
              <CheckCircle className="w-5 h-5" />
              <p className="text-sm font-semibold">You already voted on this challenge.</p>
            </div>
          )}

          {/* ── Resolve */}
          {challenge.proofSubmitted && votingEnded && !challenge.resolved && (
            <TxButton
              functionName="resolve"
              args={[BigInt(challenge.id)]}
              label="Resolve Challenge"
              pendingLabel="Resolving…"
              icon={<Shield className="w-4 h-4" />}
              disabled={!address}
              className="w-full py-3 mt-3 rounded-xl bg-secondary border border-border text-foreground font-semibold text-sm hover:bg-muted"
              onSuccess={onClose}
            />
          )}

          {/* ── Claim stake (creator) */}
          {status === "resolved_success" && isCreator && (
            <TxButton
              functionName="claim"
              args={[BigInt(challenge.id)]}
              label="Claim 1 USDC"
              pendingLabel="Claiming…"
              icon={<Coins className="w-4 h-4" />}
              disabled={!address}
              className="w-full py-3 rounded-xl bg-gradient-primary text-primary-foreground font-semibold text-sm hover:shadow-glow animate-pulse-glow"
              onSuccess={onClose}
            />
          )}

          {/* ── Claim voter reward */}
          {challenge.resolved && alreadyVoted && !rewardClaimed && (
            <TxButton
              functionName="claimVoterReward"
              args={[BigInt(challenge.id)]}
              label="Claim Voter Reward"
              pendingLabel="Claiming…"
              icon={<Coins className="w-4 h-4" />}
              disabled={!address}
              className="w-full py-3 mt-3 rounded-xl bg-secondary border border-border text-foreground font-semibold text-sm hover:bg-muted"
              onSuccess={onClose}
            />
          )}

          {status === "resolved_fail" && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-reject-light border border-reject/20 text-reject">
              <XCircle className="w-5 h-5" />
              <p className="text-sm font-semibold">Challenge failed — stake sent to treasury</p>
            </div>
          )}

          {!address && (
            <p className="text-xs text-center text-muted-foreground mt-4">Connect your wallet to interact with this challenge.</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Approve + Commit + Create flow ───────────────────────────────────────────
//
// The new contract uses a commit-reveal pattern to prevent front-running:
//   1. Approve USDC (one-time)
//   2. Upload metadata to IPFS → generate random secret → commitChallenge(hash)
//   3. Wait COMMIT_DELAY_BLOCKS (2 blocks ≈ 24s on Sepolia)
//   4. createChallenge(duration, cid, secret)

function ApproveAndCreate({ durationSecs, address, onSuccess, challengeName, challengeDesc, onRefetch }: {
  durationSecs: bigint;
  address: `0x${string}`;
  onSuccess: () => void;
  challengeName: string;
  challengeDesc: string;
  onRefetch: () => void;
}) {
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS, abi: USDC_ABI, functionName: "allowance", args: [address, CONTRACT_ADDRESS],
  });
  const { data: balance } = useReadContract({
    address: USDC_ADDRESS, abi: USDC_ABI, functionName: "balanceOf", args: [address],
  });

  const needsApproval = !allowance || (allowance as bigint) < STAKE_AMOUNT;
  const hasEnough = balance !== undefined && (balance as bigint) >= STAKE_AMOUNT;

  const { writeContract: approve, data: approveHash, isPending: approvePending, error: approveError } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  const { writeContract: createChallengeFn, data: createHash, isPending: createPending, error: createError } = useWriteContract();
  const { isLoading: createConfirming, isSuccess: createConfirmed } = useWaitForTransactionReceipt({ hash: createHash });

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => { if (approveSuccess) refetchAllowance(); }, [approveSuccess, refetchAllowance]);

  useEffect(() => {
    if (createConfirmed) {
      onRefetch();
      onSuccess();
    }
  }, [createConfirmed]);

  const handleApprove = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    approve({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "approve", args: [CONTRACT_ADDRESS, STAKE_AMOUNT] } as any);
  };

  const handleCreate = async () => {
    setUploading(true);
    setUploadError(null);
    try {
      const cid = await uploadJSONToIPFS({
        name: challengeName.trim() || "Unnamed Challenge",
        description: challengeDesc.trim(),
      });
      setUploading(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createChallengeFn({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "createChallenge",
        args: [durationSecs, cid],
      } as any);
    } catch (e) {
      setUploadError((e as Error).message ?? "Metadata upload failed");
      setUploading(false);
    }
  };


  const usdcBalance = balance !== undefined ? (Number(balance as bigint) / 1e6).toFixed(2) : "…";

  const inFlight = uploading || createPending || createConfirming;
  let statusLabel = "Create Challenge";
  if (uploading) statusLabel = "Uploading metadata to IPFS…";
  else if (createPending) statusLabel = "Staking 1 USDC…";
  else if (createConfirming) statusLabel = "Confirming…";

  return (
    <div className="space-y-3">
      <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm ${
        hasEnough ? "bg-approve-light border-approve/20 text-approve" : "bg-reject-light border-reject/20 text-reject"
      }`}>
        <span className="font-semibold">Your USDC Balance (Sepolia)</span>
        <span className="font-bold">{usdcBalance} USDC</span>
      </div>

      {!hasEnough && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-reject-light border border-reject/20 text-reject text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>You need at least 1 testnet USDC. Get some from the{" "}
            <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer" className="underline font-semibold">Circle USDC Faucet</a>.
          </span>
        </div>
      )}

      {needsApproval ? (
        <div className="space-y-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={approvePending || approveConfirming || !hasEnough}
            onClick={handleApprove}
            className="w-full py-3.5 rounded-xl bg-accent text-foreground font-bold text-sm hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {approvePending || approveConfirming ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Approving USDC…</>
            ) : (
              <><Coins className="w-4 h-4" /> Approve 1 USDC First</>
            )}
          </motion.button>
          {approveError && (
            <p className="text-xs text-reject flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {(approveError as Error).message?.split("\n")[0]?.slice(0, 100)}
            </p>
          )}
          {approveSuccess && (
            <p className="text-xs text-approve font-medium flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Approved! Now create your challenge.
            </p>
          )}
          <p className="text-xs text-muted-foreground text-center">Step 1 of 2 — Allow the contract to spend your USDC</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-approve font-medium">
            <CheckCircle className="w-3.5 h-3.5" /> USDC approved ✓
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={!hasEnough || inFlight}
            onClick={handleCreate}
            className="w-full py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-bold text-sm hover:shadow-glow flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {inFlight ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {statusLabel}</>
            ) : (
              <><Sprout className="w-4 h-4" /> Create Challenge</>
            )}
          </motion.button>
          {uploadError && (
            <p className="text-xs text-reject flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {uploadError}
            </p>
          )}


          {createError && (
            <p className="text-xs text-reject flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {(createError as Error).message?.split("\n")[0]?.slice(0, 100)}
            </p>
          )}
          {createConfirmed && (
            <p className="text-xs text-approve font-medium flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Challenge created!
            </p>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Metadata is uploaded to IPFS, then 1 USDC is staked on-chain in a single signature.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Network Guard ─────────────────────────────────────────────────────────────

function NetworkGuard() {
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  if (chainId === sepolia.id) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-2.5 bg-pending-light border-b border-pending/20 text-pending text-sm font-medium"
    >
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span className="flex-1">Wrong network — this contract is on Sepolia testnet.</span>
      <motion.button
        whileTap={{ scale: 0.96 }}
        disabled={isPending}
        onClick={() => switchChain({ chainId: sepolia.id })}
        className="px-3 py-1 rounded-lg bg-pending text-white text-xs font-bold hover:opacity-90 disabled:opacity-60 transition-all"
      >
        {isPending ? "Switching…" : "Switch to Sepolia"}
      </motion.button>
    </motion.div>
  );
}

// ── Create Challenge Modal ────────────────────────────────────────────────────

const CreateModal = ({ onClose, onRefetch }: { onClose: () => void; onRefetch: () => void }) => {
  const { address } = useAccount();
  const [hours, setHours] = useState("24");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const durationSecs = BigInt(parseInt(hours) * 3600);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-card rounded-3xl border border-border shadow-elevated w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold font-display">New Challenge</h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-2xl bg-accent/10 border border-accent/20 mb-6">
            <Coins className="w-5 h-5 text-accent mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">1 USDC will be staked</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your challenge name & description are uploaded to IPFS so everyone can see them. Uses Sepolia testnet USDC.
              </p>
            </div>
          </div>

          <div className="space-y-5 mb-6">
            <div>
              <label className="text-sm font-semibold font-display mb-2 block">
                Challenge Name <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-muted-foreground"
                placeholder="e.g. Morning walk in the park 🌿"
                maxLength={80} value={name} onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">{name.length}/80</p>
            </div>

            <div>
              <label className="text-sm font-semibold font-display mb-2 block">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-muted-foreground resize-none"
                placeholder="Describe your challenge — where you'll go, what you'll do…"
                rows={3} maxLength={280} value={description} onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">{description.length}/280</p>
            </div>

            <div>
              <label className="text-sm font-semibold font-display mb-2 block">Challenge Duration</label>
              <div className="grid grid-cols-4 gap-2">
                {["6", "12", "24", "48"].map((h) => (
                  <button
                    key={h} onClick={() => setHours(h)}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      hours === h
                        ? "bg-gradient-primary text-primary-foreground border-transparent shadow-glow"
                        : "border-border hover:border-primary/50 text-foreground"
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                You have <span className="font-semibold text-primary">{hours} hours</span> to submit your grass proof.
              </p>
            </div>
          </div>

          {address ? (
            <ApproveAndCreate
              durationSecs={durationSecs} address={address} onSuccess={onClose}
              challengeName={name} challengeDesc={description}
              onRefetch={onRefetch}
            />
          ) : (
            <p className="text-xs text-center text-muted-foreground">Connect your wallet first.</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── How It Works ──────────────────────────────────────────────────────────────

const steps = [
  { icon: <Coins className="w-6 h-6" />, title: "Stake 1 USDC", desc: "Create a challenge and lock 1 USDC as commitment." },
  { icon: <Leaf className="w-6 h-6" />, title: "Touch Grass", desc: "Actually go outside! Take a photo as your proof." },
  { icon: <Camera className="w-6 h-6" />, title: "Submit Photo", desc: "Upload your grass photo to IPFS — visible to everyone." },
  { icon: <Vote className="w-6 h-6" />, title: "Community Votes", desc: "Others approve or reject your proof on-chain." },
  { icon: <Coins className="w-6 h-6" />, title: "Claim Reward", desc: "If approved, reclaim your staked USDC!" },
];

// ── On-chain challenge loader ──────────────────────────────────────────────────
//
// Note: the new contract no longer stores metadataCID/proofCID on-chain — they
// are emitted as events only. We fetch them via getLogs on the public client
// and merge with the on-chain Challenge struct.

function useChallengeCIDs(total: number) {
  const publicClient = usePublicClient();
  const [cids, setCids] = useState<Record<number, { metadataCID?: string; proofCID?: string }>>({});

  useEffect(() => {
    if (!publicClient || total === 0) return;
    let cancelled = false;
    (async () => {
      const createdEvent = {
        type: "event",
        name: "ChallengeCreated",
        inputs: [
          { type: "uint256", name: "challengeId", indexed: true },
          { type: "address", name: "creator", indexed: true },
          { type: "string", name: "metadataCID", indexed: false },
        ],
      } as const;
      const proofEvent = {
        type: "event",
        name: "ProofSubmitted",
        inputs: [
          { type: "uint256", name: "challengeId", indexed: true },
          { type: "string", name: "proofCID", indexed: false },
        ],
      } as const;

      const CHUNK = 2000n;          // ~7 h on Sepolia — safe for all public RPCs
      const MAX_LOOKBACK = 50_000n; // ~7 days of Sepolia blocks

      try {
        const latest = await publicClient.getBlockNumber();
        const next: Record<number, { metadataCID?: string; proofCID?: string }> = {};
        let to = latest;
        const earliest = latest > MAX_LOOKBACK ? latest - MAX_LOOKBACK : 0n;
        let foundCreated = 0;

        while (!cancelled && to >= earliest) {
          const from = to > CHUNK ? to - CHUNK : 0n;
          const fromBlock = from < earliest ? earliest : from;
          try {
            const [createdLogs, proofLogs] = await Promise.all([
              publicClient.getLogs({ address: CONTRACT_ADDRESS, event: createdEvent, fromBlock, toBlock: to }),
              publicClient.getLogs({ address: CONTRACT_ADDRESS, event: proofEvent, fromBlock, toBlock: to }),
            ]);
            createdLogs.forEach((l) => {
              const id = Number((l.args as { challengeId: bigint }).challengeId);
              if (!next[id]?.metadataCID) {
                next[id] = { ...next[id], metadataCID: (l.args as { metadataCID: string }).metadataCID };
                foundCreated++;
              }
            });
            proofLogs.forEach((l) => {
              const id = Number((l.args as { challengeId: bigint }).challengeId);
              next[id] = { ...next[id], proofCID: (l.args as { proofCID: string }).proofCID };
            });
            if (Object.keys(next).length > 0) setCids({ ...next });
          } catch (chunkErr) {
            console.warn("getLogs chunk failed", fromBlock, to, chunkErr);
          }
          if (foundCreated >= total) break;
          if (fromBlock === 0n || fromBlock === earliest) break;
          to = fromBlock - 1n;
        }
      } catch (e) {
        console.error("Failed to fetch CID logs", e);
      }
    })();
    return () => { cancelled = true; };
  }, [publicClient, total]);

  return cids;
}


function useChallenges() {
  const { data: count, refetch: refetchCount } = useReadContract({
    address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: "challengeCount",
    query: { refetchInterval: 15000 },
  });
  const total = count ? Number(count) : 0;
  const contracts = Array.from({ length: total }, (_, i) => ({
    address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: "challenges" as const, args: [BigInt(i + 1)] as const,
  }));
  const { data: results, isLoading, refetch: refetchChallenges } = useReadContracts({
    contracts,
    query: { enabled: total > 0, refetchInterval: 15000 },
  });

  const cidMap = useChallengeCIDs(total);

  const refetch = () => { refetchCount(); refetchChallenges(); };

  const challenges: Challenge[] = [];
  if (results) {
    results.forEach((r, i) => {
      if (r.status === "success" && r.result) {
        // New struct: creator, proofSubmitted, resolved, success, creatorClaimed,
        //             approveVotes, rejectVotes, correctVoterCount, deadline, votingDeadline
        const [creator, proofSubmitted, resolved, success, _creatorClaimed, approveVotes, rejectVotes, _correctVoterCount, deadline, votingDeadline] =
          r.result as readonly [string, boolean, boolean, boolean, boolean, bigint, bigint, number, bigint, bigint];
        const id = i + 1;
        const eventCIDs = cidMap[id] ?? {};
        challenges.push({
          id, creator,
          deadline: Number(deadline) * 1000, votingDeadline: Number(votingDeadline) * 1000,
          metadataCID: eventCIDs.metadataCID ?? "",
          proofCID: eventCIDs.proofCID ?? "",
          approveVotes: Number(approveVotes), rejectVotes: Number(rejectVotes),
          proofSubmitted, resolved, success,
        });
      }
    });
  }
  return { challenges, isLoading, total, refetch };
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Index() {
  const { challenges, isLoading, total, refetch: refetchChallenges } = useChallenges();
  const meta = useChallengesMeta(challenges);
  const [selected, setSelected] = useState<Challenge | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "voting" | "resolved">("all");
  const [hiddenIds, setHiddenIds] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem("hiddenChallenges");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const handleHide = (id: number) => {
    setHiddenIds((prev) => {
      const next = [...prev, id];
      localStorage.setItem("hiddenChallenges", JSON.stringify(next));
      return next;
    });
  };

  const visibleChallenges = challenges.filter((c) => !hiddenIds.includes(c.id));

  const votingChallenges = visibleChallenges.filter((c) => getChallengeStatus(c) === "voting");

  const filtered = visibleChallenges.filter((c) => {
    const s = getChallengeStatus(c);
    if (filter === "all") return true;
    if (filter === "active") return s === "active";
    if (filter === "voting") return s === "voting";
    if (filter === "resolved") return s === "resolved_success" || s === "resolved_fail";
    return true;
  });

  const resolvedChallenges = visibleChallenges.filter((c) => {
    const s = getChallengeStatus(c);
    return s === "resolved_success" || s === "resolved_fail";
  });
  const successCount = resolvedChallenges.filter((c) => getChallengeStatus(c) === "resolved_success").length;
  const successRate = resolvedChallenges.length > 0
    ? Math.round((successCount / resolvedChallenges.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background grass-overlay">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <NetworkGuard />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <Sprout className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg text-foreground">TouchGrass</span>
            <span className="hidden sm:inline-block text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-semibold">Sepolia</span>
          </div>
          <WalletButton />
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroGrass})` }} />
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-24 md:py-32 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="text-6xl mb-6">
              🌿
            </motion.div>
            <h1 className="text-5xl md:text-7xl font-display font-black text-white mb-6 leading-tight">
              Proof of<br />
              <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(135deg, #86efac, #4ade80)" }}>
                Touch Grass
              </span>
            </h1>
            <p className="text-lg md:text-xl text-white/70 max-w-xl mx-auto mb-10 leading-relaxed">
              Stake USDC, go outside, submit proof on-chain. The community verifies you actually touched grass. 🌱
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setShowCreate(true)}
                className="px-8 py-4 rounded-2xl text-base font-bold font-display bg-white text-primary shadow-elevated hover:shadow-glow transition-all"
              >
                Start Challenge
              </motion.button>
              <a href="#vote" className="px-8 py-4 rounded-2xl text-base font-bold font-display border-2 border-white/30 text-white hover:border-white/60 transition-all">
                Vote on Proofs
              </a>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.6 }}
            className="grid grid-cols-3 gap-4 max-w-md mx-auto mt-16"
          >
            {[
              { label: "Challenges", value: isLoading ? "…" : total.toString() },
              { label: "USDC Staked", value: isLoading ? "…" : `${total}.00` },
              { label: "Success Rate", value: isLoading ? "…" : `${successRate}%` },
            ].map((s) => (
              <div key={s.label} className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
                <p className="text-white font-display font-bold text-xl">{s.value}</p>
                <p className="text-white/60 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Needs Your Vote section ── */}
      {votingChallenges.length > 0 && (
        <section id="vote" className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-2">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-pending/15 border border-pending/30 flex items-center justify-center">
                <Vote className="w-5 h-5 text-pending" />
              </div>
              <div>
                <h2 className="text-2xl font-display font-black text-foreground">Needs Your Vote</h2>
                <p className="text-xs text-muted-foreground">{votingChallenges.length} challenge{votingChallenges.length !== 1 ? "s" : ""} waiting for community approval</p>
              </div>
              <span className="ml-auto px-3 py-1 rounded-full bg-pending/15 text-pending text-xs font-bold border border-pending/30 animate-pulse">
                🗳️ Vote Open
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {votingChallenges.map((c) => (
                <ChallengeCard key={c.id} challenge={c} meta={meta[c.id]} onClick={() => setSelected(c)} highlight />
              ))}
            </div>
          </motion.div>
        </section>
      )}

      {/* ── How It Works ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-black text-foreground mb-3">How It Works</h2>
          <p className="text-muted-foreground max-w-md mx-auto">Five simple steps powered by a trustless smart contract.</p>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {steps.map((step, i) => (
            <motion.div
              key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="relative p-5 rounded-2xl bg-card border border-border shadow-card text-center"
            >
              {i < steps.length - 1 && <div className="hidden lg:block absolute top-1/2 -right-2 w-4 text-border text-xl z-10">→</div>}
              <div className="w-12 h-12 rounded-2xl bg-gradient-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-3">
                {step.icon}
              </div>
              <div className="w-5 h-5 rounded-full bg-gradient-primary text-primary-foreground text-xs font-bold flex items-center justify-center mx-auto mb-2">{i + 1}</div>
              <h3 className="font-display font-bold text-sm text-foreground mb-1">{step.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── All Challenges ── */}
      <section id="challenges" className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-display font-black text-foreground">Live Challenges</h2>
            <p className="text-muted-foreground text-sm mt-1">
              {isLoading ? "Loading from chain…" : `${filtered.length} challenges found`}
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-primary text-primary-foreground font-semibold text-sm shadow-glow hover:shadow-elevated transition-all"
          >
            <Sprout className="w-4 h-4" /> New Challenge
          </motion.button>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {(["all", "active", "voting", "resolved"] as const).map((f) => (
            <button
              key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all ${
                filter === f
                  ? "bg-gradient-primary text-primary-foreground shadow-glow"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              {f}
              {f === "voting" && votingChallenges.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-pending text-white text-xs font-bold">{votingChallenges.length}</span>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-sm font-medium">Fetching challenges from contract…</span>
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <span className="text-5xl">🌾</span>
            <p className="text-sm font-medium">No challenges yet. Be the first to touch grass!</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {filtered.map((c) => (
                <ChallengeCard
                  key={c.id} challenge={c} meta={meta[c.id]}
                  onClick={() => setSelected(c)}
                  highlight={getChallengeStatus(c) === "voting"}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sprout className="w-4 h-4 text-primary" />
            <span className="font-display font-semibold text-sm text-foreground">TouchGrass Protocol</span>
          </div>
          <a href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            {CONTRACT_ADDRESS.slice(0, 10)}…{CONTRACT_ADDRESS.slice(-6)}
          </a>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Shield className="w-3 h-3" />
            <span>Trustless & on-chain</span>
          </div>
        </div>
      </footer>

      {/* ── Modals ── */}
      <AnimatePresence>
        {selected && (
          <ChallengeModal
            key="detail"
            // Use the live challenge object so proofCID/metadataCID stay
            // up-to-date as event logs finish loading after the modal opens.
            challenge={challenges.find((c) => c.id === selected.id) ?? selected}
            meta={meta[selected.id]}
            onClose={() => setSelected(null)}
            onVoted={() => { setSelected(null); refetchChallenges(); }}
            onHide={handleHide}
          />
        )}
        {showCreate && (
          <CreateModal key="create" onClose={() => setShowCreate(false)} onRefetch={refetchChallenges} />
        )}
      </AnimatePresence>
    </div>
  );
}
