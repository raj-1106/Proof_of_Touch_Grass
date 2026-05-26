import { createConfig, http, fallback } from "wagmi";
import { mainnet, polygon, base, arbitrum, sepolia } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet, safe } from "wagmi/connectors";

// Get a free WalletConnect Project ID at https://cloud.walletconnect.com
const WC_PROJECT_ID = "2c4e0e2e64c64ffd1e5e3b3a8e3a3e7c";

export const wagmiConfig = createConfig({
  chains: [mainnet, polygon, base, arbitrum, sepolia],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    // Use multiple reliable public Sepolia RPCs that support getLogs.
    // The bare http() default often silently blocks getLogs with large ranges.
    [sepolia.id]: fallback([
      http("https://ethereum-sepolia-rpc.publicnode.com"),
      http("https://sepolia.drpc.org"),
      http("https://rpc2.sepolia.org"),
    ]),
  },
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({ projectId: WC_PROJECT_ID, showQrModal: true }),
    coinbaseWallet({ appName: "Proof of Touch Grass", appLogoUrl: "" }),
    safe(),
  ],
});

export type WagmiConfig = typeof wagmiConfig;
