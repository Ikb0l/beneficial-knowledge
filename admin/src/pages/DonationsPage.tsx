import { useState } from 'react';
import {
  useConfirmDonationMutation,
  useDonationDonorsQuery,
  useDonationStatsQuery,
} from '../domains/donations/api';
import { getErrorMessage } from '../lib/errors';

export default function DonationsPage() {
  const donationStatsQuery = useDonationStatsQuery();
  const donorsQuery = useDonationDonorsQuery(20);
  const confirmDonationMutation = useConfirmDonationMutation();
  const [confirmDonationId, setConfirmDonationId] = useState('');
  const [confirmResult, setConfirmResult] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const stats = donationStatsQuery.data || null;
  const donors = donorsQuery.data || [];
  const error = donationStatsQuery.error?.message || donorsQuery.error?.message || null;
  const isLoading = donationStatsQuery.isLoading || donorsQuery.isLoading;
  const isRefreshing = donationStatsQuery.isFetching || donorsQuery.isFetching;

  async function handleRefresh() {
    await Promise.all([
      donationStatsQuery.refetch(),
      donorsQuery.refetch(),
    ]);
  }

  async function handleConfirmDonation() {
    if (!confirmDonationId.trim()) {
      setConfirmError('Donation ID is required');
      return;
    }

    try {
      setConfirmError(null);
      setConfirmResult(null);
      await confirmDonationMutation.mutateAsync(confirmDonationId.trim());
      setConfirmResult('Donation confirmed');
      setConfirmDonationId('');
      await handleRefresh();
    } catch (confirmErrorValue) {
      setConfirmError(getErrorMessage(confirmErrorValue));
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Donations</h1>
        <button
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
          className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => void handleRefresh()}
            className="text-sm text-red-600 hover:text-red-800 underline"
          >
            Refresh
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Confirm Donation</h2>
        <p className="text-sm text-slate-600 mb-4">Enter a donation ID from offline payments to confirm it.</p>
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            value={confirmDonationId}
            onChange={(event) => setConfirmDonationId(event.target.value)}
            placeholder="Donation ID"
            className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg"
          />
          <button
            onClick={() => void handleConfirmDonation()}
            disabled={confirmDonationMutation.isPending}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {confirmDonationMutation.isPending ? 'Confirming...' : 'Confirm'}
          </button>
        </div>
        {confirmError && (
          <p className="text-sm text-red-600 mt-3">{confirmError}</p>
        )}
        {confirmResult && (
          <p className="text-sm text-green-700 mt-3">{confirmResult}</p>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard label="Total Donations" value={`$${(stats.totalCents / 100).toFixed(2)}`} accent="text-green-600" />
          <StatCard label="Total Count" value={String(stats.totalCount)} />
          <StatCard label="This Month" value={`$${(stats.monthCents / 100).toFixed(2)}`} accent="text-green-600" />
          <StatCard label="Month Count" value={String(stats.monthCount)} />
          <StatCard label="Unique Donors" value={String(stats.uniqueDonors)} />
          <StatCard label="Average" value={`$${(stats.avgDonationCents / 100).toFixed(2)}`} />
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Top Donors</h2>
        </div>
        {donors.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            No donations yet
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Donor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Donations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {donors.map((donor) => (
                <tr key={donor.rank} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      donor.rank === 1 ? 'bg-yellow-100 text-yellow-800' :
                      donor.rank === 2 ? 'bg-slate-200 text-slate-700' :
                      donor.rank === 3 ? 'bg-orange-100 text-orange-800' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {donor.rank}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium">
                    {donor.isAnonymous ? (
                      <span className="text-slate-400 italic">Anonymous</span>
                    ) : (
                      donor.displayName
                    )}
                  </td>
                  <td className="px-6 py-4 text-green-600 font-medium">
                    ${(donor.totalDonatedCents / 100).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {donor.donationCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-2xl font-bold text-slate-900 ${accent || ''}`}>{value}</p>
    </div>
  );
}
