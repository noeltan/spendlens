export const PLAN_FIELDS = [
  { k: 'age',           label: 'Current age',                 hint: '' },
  { k: 'retireAge',     label: 'Target retirement age',       hint: '' },
  { k: 'income',        label: 'Monthly take-home income',    hint: 'SGD, after CPF deduction' },
  { k: 'investMonthly', label: 'Monthly savings & investing', hint: 'SGD added to cash/investments' },
  { k: 'cpfMonthly',    label: 'Monthly CPF contributions',   hint: 'you + employer, SGD' },
  { k: 'ret',           label: 'Expected return % / yr',      hint: 'on investments' },
  { k: 'infl',          label: 'Inflation % / yr',            hint: '' },
  { k: 'spend',         label: 'Retirement spending / mo',    hint: "today's SGD" },
  { k: 'wr',            label: 'Withdrawal rate %',           hint: 'classic 4% rule' },
];

export const NW_FIELDS = [
  { k: 'cash',        label: 'Cash & deposits',      hint: '' },
  { k: 'invest',      label: 'Investments',          hint: 'stocks, ETFs, funds' },
  { k: 'srs',         label: 'SRS',                  hint: '' },
  { k: 'cpfOA',       label: 'CPF Ordinary Account', hint: '' },
  { k: 'cpfSA',       label: 'CPF Special Account',  hint: '' },
  { k: 'cpfMA',       label: 'CPF MediSave',         hint: '' },
  { k: 'property',    label: 'Property value',       hint: 'not counted as retirement assets' },
  { k: 'otherAssets', label: 'Other assets',         hint: '' },
  { k: 'mortgage',    label: 'Mortgage owing',       hint: 'liability — subtracted' },
  { k: 'loans',       label: 'Other debts',          hint: 'liability — subtracted' },
];

export const PLAN_DEFAULTS = { age: 35, retireAge: 65, income: 0, investMonthly: 0, cpfMonthly: 0, ret: 5, infl: 2.5, spend: 3500, wr: 4 };

// CPF interest (simplified — extra-interest tiers ignored)
const CPF_RATE_OA = 0.025, CPF_RATE_SA = 0.04, CPF_RATE_MA = 0.04;

// CPF contribution allocation (OA / SA / MA share) by age band
export function cpfAlloc(age) {
  if (age <= 35) return [0.6217, 0.1621, 0.2162];
  if (age <= 45) return [0.5677, 0.1891, 0.2432];
  if (age <= 50) return [0.5136, 0.2162, 0.2702];
  if (age <= 55) return [0.4055, 0.3108, 0.2837];
  if (age <= 60) return [0.4069, 0.2337, 0.3594];
  return [0.3694, 0.1592, 0.4714];
}

// Simulate monthly growth of investable assets + CPF until age 90.
// Retirement assets = investable + CPF OA & SA once age ≥ 55 (MediSave excluded).
// Target at a given age = annual spending inflated to that age ÷ withdrawal rate.
export function computeRetire(data) {
  const p = { ...PLAN_DEFAULTS, ...(data.plan || {}) };
  const n = data.nw || {};
  const investable0 = (n.cash || 0) + (n.invest || 0) + (n.srs || 0) + (n.otherAssets || 0) - (n.loans || 0);
  const netWorth = investable0 + (n.cpfOA || 0) + (n.cpfSA || 0) + (n.cpfMA || 0)
                 + (n.property || 0) - (n.mortgage || 0);

  const wr = (p.wr || 4) / 100;
  const targetNow = p.spend > 0 ? (p.spend * 12) / wr : 0;
  const retAssetsAt = (inv, oa, sa, age) => inv + (age >= 55 ? oa + sa : 0);
  const retireAssetsNow = retAssetsAt(investable0, n.cpfOA || 0, n.cpfSA || 0, p.age);

  const points = []; // yearly {age, assets, target}
  let readyAge = null;
  if (p.age > 0 && p.age < 90) {
    let inv = investable0, oa = n.cpfOA || 0, sa = n.cpfSA || 0;
    const months = Math.round((90 - p.age) * 12);
    for (let m = 0; m <= months; m++) {
      const age = p.age + m / 12;
      if (m % 12 === 0) {
        const target = targetNow * Math.pow(1 + (p.infl || 0) / 100, age - p.age);
        const assets = retAssetsAt(inv, oa, sa, age);
        points.push({ age: Math.round(age), assets: Math.round(assets), target: Math.round(target) });
        if (readyAge === null && targetNow > 0 && assets >= target) readyAge = Math.round(age);
      }
      inv *= 1 + (p.ret || 0) / 100 / 12;
      oa  *= 1 + CPF_RATE_OA / 12;
      sa  *= 1 + CPF_RATE_SA / 12;
      // contribute while still working (until ready or target age, whichever is later)
      const stillWorking = age < Math.max(p.retireAge || 0, readyAge ?? 999);
      if (stillWorking) {
        inv += p.investMonthly || 0;
        const [aOA, aSA] = cpfAlloc(age);
        oa += (p.cpfMonthly || 0) * aOA;
        sa += (p.cpfMonthly || 0) * aSA;
      }
    }
  }

  return { summary: { netWorth, retireAssetsNow, targetNow, readyAge }, points };
}

export function fmtSGD(n) {
  const sign = n < 0 ? '−' : '';
  return sign + 'S$' + Math.abs(Math.round(n)).toLocaleString('en-SG');
}

export function fmtCompact(n) {
  if (Math.abs(n) >= 1e6) return 'S$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1e3) return 'S$' + Math.round(n / 1e3) + 'k';
  return 'S$' + String(Math.round(n));
}
