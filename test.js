const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { compute } = require("./index.js");

function run(args) {
  try {
    return { stdout: execFileSync("node", ["index.js", ...args], { encoding: "utf8" }), code: 0 };
  } catch (e) {
    return { stdout: e.stdout || "", stderr: e.stderr || "", code: e.status };
  }
}

function test_npd_cheaper_below_limit_default_share() {
  const r = compute(1200000, 80);
  assert.strictEqual(r.npd.available, true);
  assert.ok(r.npd.net > r.ip_usn.net);
}

function test_npd_unavailable_above_limit() {
  const r = compute(3000000, 80);
  assert.strictEqual(r.npd.available, false);
  assert.strictEqual(r.npd.tax, null);
  assert.strictEqual(r.npd.net, null);
}

function test_npd_available_at_exact_limit() {
  const r = compute(2400000, 100);
  assert.strictEqual(r.npd.available, true);
}

function test_ip_fixed_contribution_floor_at_zero_income() {
  const r = compute(0, 80);
  assert.strictEqual(r.ip_usn.tax, 57390);
  assert.strictEqual(r.ip_usn.net, -57390);
}

function test_ip_percent_threshold() {
  const r = compute(300000, 0);
  assert.strictEqual(r.ip_usn.tax, 300000 * 0.06 + 57390);
}

function test_b2b_share_changes_npd_rate() {
  const allB2b = compute(1000000, 100);
  const allB2c = compute(1000000, 0);
  assert.strictEqual(allB2b.npd.tax, 60000);
  assert.strictEqual(allB2c.npd.tax, 40000);
}

// Parity check against the Python implementation (kleogeos/freelance-ru-tax-cli),
// same income/b2b-share pairs run through `python3 ru_tax.py --json` during development.
function test_matches_python_reference_values() {
  const r = compute(1200000, 80);
  assert.strictEqual(r.npd.tax, 67200);
  assert.strictEqual(r.npd.net, 1132800);
  assert.strictEqual(r.ip_usn.tax, 138390);
  assert.strictEqual(r.ip_usn.net, 1061610);
}

function test_cli_json_output_is_valid_json() {
  const result = run(["--income", "1200000", "--json"]);
  assert.strictEqual(result.code, 0);
  const data = JSON.parse(result.stdout);
  assert.strictEqual(data.income, 1200000.0);
}

function test_cli_table_output_mentions_both_regimes() {
  const result = run(["--income", "1200000"]);
  assert.strictEqual(result.code, 0);
  assert.ok(result.stdout.includes("НПД"));
  assert.ok(result.stdout.includes("ИП"));
}

function test_cli_crypto_flag_adds_warning() {
  const withCrypto = run(["--income", "900000", "--crypto"]);
  const withoutCrypto = run(["--income", "900000"]);
  assert.ok(withCrypto.stdout.includes("418-ФЗ"));
  assert.ok(!withoutCrypto.stdout.includes("418-ФЗ"));
}

function test_cli_rejects_negative_income() {
  const result = run(["--income", "-5"]);
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes("отрицательным"));
}

function test_cli_rejects_out_of_range_b2b_share() {
  const result = run(["--income", "100", "--b2b-share", "150"]);
  assert.strictEqual(result.code, 1);
  assert.ok(result.stderr.includes("0-100"));
}

function test_cli_missing_required_income_exits_nonzero() {
  const result = run([]);
  assert.notStrictEqual(result.code, 0);
}

const tests = [
  test_npd_cheaper_below_limit_default_share,
  test_npd_unavailable_above_limit,
  test_npd_available_at_exact_limit,
  test_ip_fixed_contribution_floor_at_zero_income,
  test_ip_percent_threshold,
  test_b2b_share_changes_npd_rate,
  test_matches_python_reference_values,
  test_cli_json_output_is_valid_json,
  test_cli_table_output_mentions_both_regimes,
  test_cli_crypto_flag_adds_warning,
  test_cli_rejects_negative_income,
  test_cli_rejects_out_of_range_b2b_share,
  test_cli_missing_required_income_exits_nonzero,
];

let failed = 0;
for (const t of tests) {
  try {
    t();
    console.log(`PASS: ${t.name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL: ${t.name}: ${e.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
