#!/usr/bin/env node
"use strict";

const NPD_LIMIT = 2400000;
const IP_FIXED_CONTRIBUTION_2026 = 57390;
const IP_PCT_THRESHOLD = 300000;

// Matches Python's round(n, 2): correctly-rounded decimal with ties-to-even,
// based on the exact binary value rather than a naive *100 multiply (which
// can itself introduce a spurious tie in IEEE 754). Reused as-is from the
// freelance-tax-js port, where it was first needed and tested.
function round2(n) {
  if (n === 0) return 0;
  const neg = n < 0;
  const ax = Math.abs(n);
  let s = ax.toFixed(20);
  let [intPart, fracPart] = s.split(".");
  const keep = fracPart.slice(0, 2);
  const rest = fracPart.slice(2);
  let roundUp;
  if (rest[0] > "5") roundUp = true;
  else if (rest[0] < "5") roundUp = false;
  else {
    const restAfter = rest.slice(1).replace(/0+$/, "");
    if (restAfter.length > 0) roundUp = true;
    else roundUp = parseInt(keep[1] || "0", 10) % 2 === 1;
  }
  let keepNum = BigInt(intPart + keep.padEnd(2, "0"));
  if (roundUp) keepNum += 1n;
  const result = Number(keepNum) / 100;
  return neg ? -result : result;
}

function asFloat(n) {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

function compute(income, b2bSharePct) {
  const b2bPart = income * (b2bSharePct / 100);
  const b2cPart = income - b2bPart;
  const npdTax = b2bPart * 0.06 + b2cPart * 0.04;
  const npdAvailable = income <= NPD_LIMIT;

  const ipTax = income * 0.06 + IP_FIXED_CONTRIBUTION_2026 + Math.max(0, income - IP_PCT_THRESHOLD) * 0.01;

  return {
    income: income,
    b2b_share_pct: b2bSharePct,
    npd: {
      available: npdAvailable,
      tax: npdAvailable ? round2(npdTax) : null,
      net: npdAvailable ? round2(income - npdTax) : null,
    },
    ip_usn: {
      tax: round2(ipTax),
      net: round2(income - ipTax),
    },
    npd_limit: NPD_LIMIT,
  };
}

function toJson(r) {
  const npdTax = r.npd.tax === null ? "null" : asFloat(r.npd.tax);
  const npdNet = r.npd.net === null ? "null" : asFloat(r.npd.net);
  return [
    "{",
    `  "income": ${asFloat(r.income)},`,
    `  "b2b_share_pct": ${asFloat(r.b2b_share_pct)},`,
    `  "npd": {`,
    `    "available": ${r.npd.available},`,
    `    "tax": ${npdTax},`,
    `    "net": ${npdNet}`,
    `  },`,
    `  "ip_usn": {`,
    `    "tax": ${asFloat(r.ip_usn.tax)},`,
    `    "net": ${asFloat(r.ip_usn.net)}`,
    `  },`,
    `  "npd_limit": ${r.npd_limit}`,
    "}",
  ].join("\n");
}

function fmt(n) {
  return Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ");
}

function formatTable(r, crypto) {
  const lines = [];
  lines.push(`Годовой доход: ${fmt(r.income)} ₽`);
  lines.push("");
  if (r.npd.available) {
    lines.push(`НПД (самозанятый): налог ${fmt(r.npd.tax)} ₽, на руки ${fmt(r.npd.net)} ₽`);
  } else {
    lines.push("НПД (самозанятый): недоступен — доход выше лимита 2 400 000 ₽/год");
  }
  lines.push(`ИП на УСН 6%:      налог+взносы ${fmt(r.ip_usn.tax)} ₽, на руки ${fmt(r.ip_usn.net)} ₽`);
  lines.push("");

  if (!r.npd.available) {
    lines.push(`При этом доходе доступен только ИП: на руки ${fmt(r.ip_usn.net)} ₽`);
  } else if (r.npd.net >= r.ip_usn.net) {
    lines.push(`Выгоднее: самозанятость (на ${fmt(r.npd.net - r.ip_usn.net)} ₽ больше на руки)`);
  } else {
    lines.push(`Выгоднее: ИП (на ${fmt(r.ip_usn.net - r.npd.net)} ₽ больше на руки)`);
  }

  if (crypto) {
    lines.push("");
    lines.push(
      "Внимание: доход в USDT/крипте от иностранного клиента на НПД — серая правовая\n" +
        "зона с 418-ФЗ (с 2025 года формально НПД не распространяется на доходы от\n" +
        "операций с криптовалютой). Для регулярного крипто-дохода предсказуемость ИП\n" +
        "может быть важнее разницы в налоге, показанной выше."
    );
  }

  lines.push("");
  lines.push(
    "Упрощённый расчёт для одиночного фрилансера без сотрудников и без региональных\n" +
      "льгот по УСН. Не налоговая консультация — проверьте текущие ставки у бухгалтера\n" +
      "или на сайте ФНС перед решением."
  );
  return lines.join("\n");
}

function parseArgs(argv) {
  const out = { income: null, b2bShare: 80, crypto: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--income") out.income = Number(argv[++i]);
    else if (a === "--b2b-share") out.b2bShare = Number(argv[++i]);
    else if (a === "--crypto") out.crypto = true;
    else if (a === "--json") out.json = true;
  }
  return out;
}

function printHelp() {
  console.log(`freelance-ru-tax-js - compare Russian NPD (self-employed) vs IP на УСН tax. Not tax advice.

Usage:
  freelance-ru-tax --income N [--b2b-share N] [--crypto] [--json]

Run without installing:
  npx github:kleogeos/freelance-ru-tax-js --income 1200000
`);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    printHelp();
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const args = parseArgs(argv);
  if (args.income === null) {
    console.error("error: --income is required");
    printHelp();
    process.exit(1);
  }
  if (args.income < 0) {
    console.error("--income не может быть отрицательным");
    process.exit(1);
  }
  if (args.b2bShare < 0 || args.b2bShare > 100) {
    console.error("--b2b-share должен быть в диапазоне 0-100");
    process.exit(1);
  }

  const r = compute(args.income, args.b2bShare);

  if (args.json) {
    console.log(toJson(r));
    return;
  }

  console.log(formatTable(r, args.crypto));
}

if (require.main === module) {
  main();
}

module.exports = { compute };
