"use client";

import * as React from "react";
import {
  Activity,
  MessagesSquare,
  BarChart3,
  Cpu,
  Radio,
  Wrench,
  Brain,
  UserCog,
  Circle,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGatewayStatus } from "@/hooks/use-gateway-status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  StatusPanel,
  SessionsPanel,
  UsagePanel,
  ProvidersPanel,
  ChannelsPanel,
  SkillsPanel,
  MemoryPanel,
  PersonaPanel,
  CronPanel,
} from "./panels";

function MetricBar() {
  const { status, connection } = useGatewayStatus(10000);
  const dot =
    connection === "online" ? "text-success" : connection === "offline" ? "text-destructive" : "text-warning";
  const items: { label: string; value: string }[] = [
    { label: "status", value: connection },
    { label: "version", value: status?.version ? `v${status.version}` : "—" },
    { label: "provider", value: status?.provider || "—" },
    { label: "model", value: status?.model || "—" },
    { label: "memory", value: status?.memory_backend || "—" },
    { label: "autonomy", value: status?.autonomy || "—" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border bg-card/50 px-4 py-2">
      <div className="flex items-center gap-1.5">
        <Circle className={cn("size-2.5 fill-current", dot)} />
        <span className="text-xs font-medium capitalize">{connection}</span>
      </div>
      {items.slice(1).map((it) => (
        <div key={it.label} className="flex items-baseline gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</span>
          <span className="font-mono text-xs">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

const TABS = [
  { value: "status", label: "Status", icon: Activity, el: <StatusPanel /> },
  { value: "sessions", label: "Sessions", icon: MessagesSquare, el: <SessionsPanel /> },
  { value: "usage", label: "Usage", icon: BarChart3, el: <UsagePanel /> },
  { value: "providers", label: "Providers", icon: Cpu, el: <ProvidersPanel /> },
  { value: "channels", label: "Channels", icon: Radio, el: <ChannelsPanel /> },
  { value: "cron", label: "Cron", icon: CalendarClock, el: <CronPanel /> },
  { value: "skills", label: "Skills", icon: Wrench, el: <SkillsPanel /> },
  { value: "memory", label: "Memory", icon: Brain, el: <MemoryPanel /> },
  { value: "persona", label: "Persona", icon: UserCog, el: <PersonaPanel /> },
];

export function OpsScreen() {
  const [tab, setTab] = React.useState("status");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MetricBar />
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-2">
          <TabsList>
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value}>
                <Icon className="size-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-5xl px-4 py-5">
            {TABS.map(({ value, el }) => (
              <TabsContent key={value} value={value} className="mt-0">
                {el}
              </TabsContent>
            ))}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
