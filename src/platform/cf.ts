/**
 * Cloudflare API — দোকানদারের ডোমেইন আমাদের অ্যাকাউন্টে যোগ, নেমসার্ভার, Worker-এর সাথে যুক্ত করা, DNS রেকর্ড।
 * দরকার: CF_API_TOKEN (Zone Edit, DNS Edit, Workers Routes Edit), CF_ACCOUNT_ID
 */
export type CfConfig = { token?: string; accountId?: string; workerName?: string };

export type CfResult<T> = { ok: boolean; result: T; errors: { code: number; message: string }[] };

export type DnsRecord = {
  id: string; type: string; name: string; content: string; proxied?: boolean; ttl?: number; priority?: number;
  meta?: { read_only?: boolean; origin_worker_id?: string };
};

export class Cloudflare {
  constructor(private cfg: CfConfig) {}

  get configured(): boolean {
    return !!(this.cfg.token && this.cfg.accountId);
  }

  async req<T = any>(method: string, path: string, body?: unknown): Promise<CfResult<T>> {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
        method,
        headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { code: number; message: string }[] };
      return { ok: res.ok && json.success !== false, result: json.result as T, errors: json.errors ?? [] };
    } catch (e) {
      return { ok: false, result: undefined as T, errors: [{ code: 0, message: (e as Error).message }] };
    }
  }

  createZone(name: string) {
    return this.req<{ id: string; name_servers: string[]; status: string }>("POST", "/zones", { name, account: { id: this.cfg.accountId }, type: "full" });
  }
  getZone(id: string) {
    return this.req<{ id: string; status: string; name_servers: string[] }>("GET", `/zones/${id}`);
  }
  activationCheck(id: string) {
    return this.req("PUT", `/zones/${id}/activation_check`);
  }
  deleteZone(id: string) {
    return this.req("DELETE", `/zones/${id}`);
  }

  attachWorker(hostname: string, zoneId: string) {
    return this.req("PUT", `/accounts/${this.cfg.accountId}/workers/domains`, {
      hostname, zone_id: zoneId, service: this.cfg.workerName || "f-shop", environment: "production",
    });
  }
  listWorkerDomains(zoneId: string) {
    return this.req<{ id: string; hostname: string }[]>("GET", `/accounts/${this.cfg.accountId}/workers/domains?zone_id=${zoneId}`);
  }
  detachWorker(id: string) {
    return this.req("DELETE", `/accounts/${this.cfg.accountId}/workers/domains/${id}`);
  }

  listDns(zoneId: string) {
    return this.req<DnsRecord[]>("GET", `/zones/${zoneId}/dns_records?per_page=500`);
  }
  createDns(zoneId: string, rec: Partial<DnsRecord>) {
    return this.req<DnsRecord>("POST", `/zones/${zoneId}/dns_records`, rec);
  }
  deleteDns(zoneId: string, id: string) {
    return this.req("DELETE", `/zones/${zoneId}/dns_records/${id}`);
  }
  scanTrigger(zoneId: string) {
    return this.req("POST", `/zones/${zoneId}/dns_records/scan/trigger`, {});
  }
  scanList(zoneId: string) {
    return this.req<DnsRecord[]>("GET", `/zones/${zoneId}/dns_records/scan/review`);
  }
  scanReview(zoneId: string, accepts: string[], rejects: string[]) {
    return this.req("POST", `/zones/${zoneId}/dns_records/scan/review`, {
      accepts: accepts.map((id) => ({ id })), rejects: rejects.map((id) => ({ id })),
    });
  }
}

export function cfError(r: CfResult<unknown>): string {
  const e = r.errors[0];
  if (!e) return "Cloudflare থেকে উত্তর পাওয়া যায়নি";
  if (e.code === 1061) return "এই ডোমেইন আগে থেকেই Cloudflare-এ (অন্য কোনো অ্যাকাউন্টে) যোগ করা আছে। সেখান থেকে সরিয়ে আবার চেষ্টা করুন।";
  if (e.code === 1099 || e.code === 1105) return "এই ডোমেইনটি যোগ করা যাচ্ছে না। সঠিক মূল ডোমেইন দিয়েছেন কি না দেখুন।";
  return `${e.message} (কোড ${e.code})`;
}
