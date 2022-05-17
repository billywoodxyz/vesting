import {
  Keypair,
  Transaction,
  SystemProgram,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import {
  setProvider,
  workspace,
  AnchorProvider,
  Program,
  BN,
} from "@project-serum/anchor";
import assert from "assert";
import { Vesting } from "../target/types/vesting";

describe("vesting", () => {
  // Configure the client to use the local cluster.
  setProvider(AnchorProvider.env());

  const program = workspace.Vesting as Program<Vesting>;
  const provider = program.provider as AnchorProvider;
  let vestingAddr;
  let vaultAddr;
  let vaultSignerAddr;
  let targetAddr;

  const totalAmount = 3_000_000;
  const unitAmount = 1_000_000;

  it("Is initialized!", async () => {
    const [mint, depositFrom] = await createTokenAccounts(
      provider,
      totalAmount
    );
    const vesting = Keypair.generate();
    const [vaultSigner, bump] = await PublicKey.findProgramAddress(
      [vesting.publicKey.toBuffer()],
      program.programId
    );
    const [vault] = await PublicKey.findProgramAddress(
      [vaultSigner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const startTime = new Date().valueOf() / 1000;
    await program.methods
      .initialize(
        bump,
        new BN(startTime),
        new BN(totalAmount),
        new BN(2),
        new BN(unitAmount)
      )
      .accounts({
        vesting: vesting.publicKey,
        mint: mint,
        depositFrom: depositFrom,
        payer: provider.wallet.publicKey,
        vaultSigner: vaultSigner,
        vault: vault,
        owner: provider.wallet.publicKey,
        rent: SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([vesting])
      .rpc();
    vestingAddr = vesting.publicKey;
    vaultAddr = vault;
    vaultSignerAddr = vaultSigner;
    targetAddr = depositFrom;
  });

  async function unlockAndAssert(expectedAmount: number) {
    await program.methods
      .unlock()
      .accounts({
        vesting: vestingAddr,
        vaultSigner: vaultSignerAddr,
        vault: vaultAddr,
        target: targetAddr,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    const acc = await getAccount(provider.connection, targetAddr);
    assert.equal(acc.amount, expectedAmount);
  }

  it("unlock on schedule", async () => {
    await sleep(2000);
    await unlockAndAssert(unitAmount);
    await sleep(2000);
    await unlockAndAssert(unitAmount * 2);
    await sleep(2000);
    await unlockAndAssert(unitAmount * 3);
    await sleep(2000);
    await unlockAndAssert(unitAmount * 3);
  });
});

function sleep(ms: number): Promise<any> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createTokenAccounts(provider: AnchorProvider, amount: number) {
  const tx = new Transaction();
  const mint = Keypair.generate();
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: 82,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
      programId: TOKEN_PROGRAM_ID,
    })
  );
  tx.add(
    await createInitializeMintInstruction(
      mint.publicKey,
      6,
      provider.wallet.publicKey,
      null
    )
  );
  const depositFrom = Keypair.generate();
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: depositFrom.publicKey,
      space: 165,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(
        165
      ),
      programId: TOKEN_PROGRAM_ID,
    })
  );
  tx.add(
    await createInitializeAccountInstruction(
      depositFrom.publicKey,
      mint.publicKey,
      provider.wallet.publicKey
    )
  );
  tx.add(
    await createMintToInstruction(
      mint.publicKey,
      depositFrom.publicKey,
      provider.wallet.publicKey,
      amount
    )
  );
  await provider.sendAndConfirm(tx, [mint, depositFrom]);
  return [mint.publicKey, depositFrom.publicKey];
}
