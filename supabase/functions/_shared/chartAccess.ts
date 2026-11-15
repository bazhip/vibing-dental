// Who may act on a chart from an edge function: the user who created it, or
// any member of the practice it is shared to. Shared by send-owner-report and
// mark-pims-sent. Callers pass the service-role client (RLS is bypassed, so
// this check IS the access control).

export interface ChartOwnership {
  created_by: string;
  practice_id: string | null;
}

// Just the slice of the Supabase client this check uses, so tests can fake it.
interface MembershipClient {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

export async function canAccessChart(
  admin: MembershipClient,
  chart: ChartOwnership,
  callerId: string,
): Promise<{ allowed: boolean; isMember: boolean }> {
  let isMember = false;
  if (chart.practice_id) {
    const { data: mem } = await admin
      .from('practice_members')
      .select('user_id')
      .eq('practice_id', chart.practice_id)
      .eq('user_id', callerId)
      .maybeSingle();
    isMember = !!mem;
  }
  return { allowed: chart.created_by === callerId || isMember, isMember };
}
