use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod vesting {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        bump: u8,
        start_time: i64,
        total_amount: u64,
        unit_time: u64,
        unit_amount: u64,
    ) -> Result<()> {
        let cur_ts = Clock::get()?.unix_timestamp;
        assert!(cur_ts <= start_time);

        let vesting = &mut ctx.accounts.vesting;
        vesting.owner = ctx.accounts.owner.key();
        vesting.vault = ctx.accounts.vault.key();
        vesting.start_time = start_time;
        vesting.total_amount = total_amount;
        vesting.unit_time = unit_time;
        vesting.unit_amount = unit_amount;
        vesting.bump = bump;

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = Transfer {
            from: ctx.accounts.deposit_from.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        transfer(cpi_ctx, total_amount)
    }

    pub fn unlock(ctx: Context<Unlock>) -> Result<()> {
        let vesting_addr = ctx.accounts.vesting.key();
        let vesting = &mut ctx.accounts.vesting;
        let cur_ts = Clock::get()?.unix_timestamp;
        let units = (cur_ts - vesting.start_time) as u64 / vesting.unit_time;
        let amount = (units * vesting.unit_amount).min(vesting.total_amount);
        vesting.start_time = vesting.start_time + (vesting.unit_time * units) as i64;
        vesting.total_amount -= amount;

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.target.to_account_info(),
            authority: ctx.accounts.vault_signer.clone(),
        };
        let seeds = &[vesting_addr.as_ref(), &[vesting.bump]];
        let signer = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        transfer(cpi_ctx, amount)
    }
}

#[derive(Accounts)]
#[instruction(vault_signer_bump: u8)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = std::mem::size_of::<Vesting>() + 8,
    )]
    pub vesting: Box<Account<'info, Vesting>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        constraint = deposit_from.mint == mint.key(),
    )]
    pub deposit_from: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: No need
    #[account(
        seeds = [vesting.key().as_ref()],
        bump = vault_signer_bump
    )]
    pub vault_signer: AccountInfo<'info>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = vault_signer,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: No need
    #[account(
        owner = system_program.key()
    )]
    pub owner: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unlock<'info> {
    #[account(mut)]
    pub vesting: Box<Account<'info, Vesting>>,
    /// CHECK: No need
    pub vault_signer: AccountInfo<'info>,
    /// CHECK: No need
    #[account(
        mut,
        address = vesting.vault
    )]
    pub vault: AccountInfo<'info>,
    #[account(
        mut,
        constraint = target.owner == vesting.owner
    )]
    pub target: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Vesting {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub start_time: i64,
    pub total_amount: u64,
    pub unit_time: u64,
    pub unit_amount: u64,
    pub bump: u8,
}
