import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';
import { useAPI } from '../hooks/useIPC';
import { categoryColor, formatDuration, todayString } from '../lib/format';
import type { TimeFormat, AppUsageStat } from '../../../shared/types';
import { BarChart3 } from 'lucide-react';

interface Props {
  timeFormat: TimeFormat;
}

export default function ReportsView({ timeFormat }: Props) {
  const api = useAPI();
  const [date] = useState(todayString());
  const [usage, setUsage] = useState<AppUsageStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.dashboard.appUsage(date).then(setUsage).finally(() => setLoading(false));
  }, [date]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const byCategory = usage.reduce((acc, u) => {
    acc[u.category] = (acc[u.category] || 0) + u.seconds;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([category, seconds]) => ({
      name: category.charAt(0).toUpperCase() + category.slice(1),
      value: seconds,
      color: categoryColor(category),
    }));

  const barData = usage.slice(0, 10).map((u) => ({
    name: u.app,
    duration: u.seconds,
    color: categoryColor(u.category),
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{payload[0].name || payload[0].payload?.name}</p>
          <p className="text-sm text-muted-foreground">{formatDuration(payload[0].value || payload[0].payload?.duration)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-full p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl">Reports</h1>
          </div>
          <div className="px-3 py-1.5 bg-muted text-muted-foreground rounded-full text-sm">
            Analytics
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>

        {usage.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BarChart3 className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg mb-2">No reports available</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Start a recording session to see analytics and insights about your productivity.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {/* Time by Category */}
            <div className="bg-card rounded-xl p-6 border border-border">
              <h2 className="text-lg mb-6">Time by Category</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div className="grid grid-cols-2 gap-3 mt-6 pt-6 border-t border-border">
                {pieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-muted-foreground">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Applications */}
            <div className="bg-card rounded-xl p-6 border border-border">
              <h2 className="text-lg mb-6">Top Applications</h2>
              <div style={{ height: Math.max(barData.length * 44 + 30, 120) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    barCategoryGap="20%"
                  >
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#7A7770' }} tickFormatter={(v) => formatDuration(v)} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12, fill: '#2D2A26' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="duration" radius={[0, 4, 4, 0]} barSize={24}>
                      {barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
