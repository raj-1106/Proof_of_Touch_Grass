import { useState } from "react";
import { useConnect, useDisconnect, useAccount, useReadContract } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, Wallet, ExternalLink, Copy, Check, LogOut, AlertCircle } from "lucide-react";
import { USDC_ADDRESS, USDC_ABI } from "@/lib/contract";

// Wallet brand logos as inline SVGs / emojis mapped by connector id
const WALLET_META: Record<string, { icon: string; description: string; badge?: string }> = {
  injected: {
    icon: "🦊",
    description: "MetaMask or any browser extension wallet",
    badge: "Browser",
  },
  metaMask: {
    icon: "🦊",
    description: "The most popular Ethereum wallet",
    badge: "Popular",
  },
  walletConnect: {
    icon: "🔗",
    description: "Scan with any mobile wallet (300+ supported)",
    badge: "Mobile",
  },
  coinbaseWallet: {
    icon: "🔵",
    description: "The Coinbase self-custody wallet",
    badge: "Coinbase",
  },
  safe: {
    icon: "🛡️",
    description: "Connect via a Gnosis Safe multisig",
    badge: "Multisig",
  },
};

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ── Connected Account Dropdown ─────────────────────────────────────────────

interface AccountDropdownProps {
  address: string;
  onClose: () => void;
  onDisconnect: () => void;
}

export function AccountDropdown({ address, onClose, onDisconnect }: AccountDropdownProps) {
  const [copied, setCopied] = useState(false);

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
  });

  const formattedUsdc = usdcBalance !== undefined
    ? (Number(usdcBalance as bigint) / 1e6).toFixed(2)
    : "…";

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-end pt-20 pr-4 sm:pr-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: -10 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl shadow-elevated w-72 overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 border-b border-border bg-gradient-primary/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-lg animate-float">
              🌿
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-0.5">Connected · Sepolia</p>
              <p className="text-sm font-bold font-display text-foreground truncate">{truncateAddress(address)}</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-approve animate-pulse" />
          </div>
          {/* USDC balance */}
          <div className="mt-3 flex items-center justify-between px-3 py-2 rounded-xl bg-card border border-border">
            <span className="text-xs text-muted-foreground font-medium">USDC Balance</span>
            <span className="text-sm font-bold text-foreground">{formattedUsdc} <span className="text-xs text-muted-foreground">USDC</span></span>
          </div>
        </div>

        {/* Actions */}
        <div className="p-2">
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-sm"
          >
            {copied ? <Check className="w-4 h-4 text-approve" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
            <span className={copied ? "text-approve font-medium" : "text-foreground"}>
              {copied ? "Copied!" : "Copy Address"}
            </span>
          </button>
          <a
            href={`https://sepolia.etherscan.io/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-sm"
          >
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground">View on Sepolia Etherscan</span>
          </a>
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-sm"
          >
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground">Get Testnet USDC</span>
          </a>
          <button
            onClick={() => { onDisconnect(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-reject-light transition-colors text-sm text-reject mt-1"
          >
            <LogOut className="w-4 h-4" />
            <span className="font-semibold">Disconnect</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Wallet Connect Modal ───────────────────────────────────────────────────

interface WalletModalProps {
  onClose: () => void;
}

export function WalletModal({ onClose }: WalletModalProps) {
  const { connectors, connect, isPending, error } = useConnect();
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const handleConnect = (connector: (typeof connectors)[0]) => {
    setConnectingId(connector.id);
    connect(
      { connector },
      {
        onSuccess: () => { onClose(); },
        onError: () => { setConnectingId(null); },
      }
    );
  };

  // De-duplicate: prefer named connectors over generic "injected"
  const unique = connectors.filter((c, idx, arr) => {
    if (c.id === "injected") {
      return !arr.some((x) => x.id !== "injected" && x.name?.toLowerCase().includes("metamask"));
    }
    return true;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
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
        className="relative bg-card rounded-3xl border border-border shadow-elevated w-full max-w-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-xl font-bold font-display text-foreground">Connect Wallet</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Choose how you'd like to connect</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Connectors list */}
        <div className="px-4 pb-4 space-y-2">
          {unique.map((connector, i) => {
            const meta = WALLET_META[connector.id] ?? WALLET_META["injected"];
            const isLoading = connectingId === connector.id && isPending;

            return (
              <motion.button
                key={connector.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                whileTap={{ scale: 0.98 }}
                disabled={isPending}
                onClick={() => handleConnect(connector)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-border bg-background hover:border-primary/40 hover:bg-primary/5 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {/* Icon */}
                <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform">
                  {meta.icon}
                </div>

                {/* Info */}
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold font-display text-foreground truncate">
                      {connector.name}
                    </p>
                    {meta.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold shrink-0">
                        {meta.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {meta.description}
                  </p>
                </div>

                {/* Arrow / Spinner */}
                <div className="shrink-0">
                  {isLoading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full"
                    />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-4 mb-4 flex items-start gap-2 p-3 rounded-xl bg-reject-light border border-reject/20 text-reject text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error.message?.split(".")[0] ?? "Connection failed. Please try again."}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer note */}
        <div className="px-6 pb-5 text-center">
          <p className="text-xs text-muted-foreground">
            By connecting you agree to interact with the{" "}
            <span className="text-primary font-medium">TouchGrass contract</span> on your chosen network.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Wallet Button (navbar) ─────────────────────────────────────────────────

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [showModal, setShowModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <>
      {isConnected && address ? (
        <>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowDropdown(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-approve-light text-approve border border-approve/20 hover:border-approve/40 transition-all"
          >
            <span className="w-2 h-2 rounded-full bg-approve animate-pulse" />
            <Wallet className="w-4 h-4" />
            {truncateAddress(address)}
          </motion.button>
          <AnimatePresence>
            {showDropdown && (
              <AccountDropdown
                address={address}
                onClose={() => setShowDropdown(false)}
                onDisconnect={disconnect}
              />
            )}
          </AnimatePresence>
        </>
      ) : (
        <>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-primary text-primary-foreground shadow-glow hover:shadow-elevated transition-all"
          >
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </motion.button>
          <AnimatePresence>
            {showModal && <WalletModal onClose={() => setShowModal(false)} />}
          </AnimatePresence>
        </>
      )}
    </>
  );
}
