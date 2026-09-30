import { useMemo } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell } from "recharts";

export function TagChart({ data }: { data: Array<{ label: string; count: number }> }) {
  const chartData = useMemo(() => {
    // Sort by count descending and take top 10
    return [...data].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-[250px] items-center justify-center rounded-xl border border-dashed border-border bg-card text-sm text-muted-foreground">
        분석된 태그 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="h-[250px] w-full rounded-xl border border-border bg-card p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e8e4d9" />
          <XAxis type="number" hide />
          <YAxis 
            dataKey="label" 
            type="category" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#6a6e6b', fontSize: 12 }} 
            width={80}
          />
          <Tooltip 
            cursor={{ fill: "rgba(36, 63, 56, 0.05)" }} 
            contentStyle={{ borderRadius: '8px', border: '1px solid #ddd6c8', backgroundColor: '#fffcf7', fontSize: '13px' }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill="#243f38" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
