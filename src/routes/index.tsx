import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ControlsPanel } from "@/components/ControlsPanel";
import { ParliamentGraph } from "@/components/ParliamentGraph";
import { Button } from "@/components/ui/button";
import type { ParliamentConfig } from "@/lib/parliament/types";
import { Download } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

const initialConfig: ParliamentConfig = {
  layout: "hemicycle",
  title: "My Parliament",
  parties: [
    { id: "a", name: "Reds", seats: 60, fill: "#e63946", stroke: "#000000", strokeWidth: 0.1 },
    { id: "b", name: "Blues", seats: 50, fill: "#1d3557", stroke: "#000000", strokeWidth: 0.1 },
    { id: "c", name: "Greens", seats: 25, fill: "#2a9d8f", stroke: "#000000", strokeWidth: 0.1 },
    { id: "d", name: "Yellows", seats: 15, fill: "#f4a261", stroke: "#000000", strokeWidth: 0.1 },
  ],
  sections: [],
  showDividers: true,
};

function Index() {
  const [config, setConfig] = useState<ParliamentConfig>(initialConfig);
  const svgRef = useRef<SVGSVGElement>(null);

  const exportSVG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    // resolve currentColor → black for portability
    clone.setAttribute("style", "color: #111;");
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.title || "parliament"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Parliament Graph Generator</h1>
          <Button onClick={exportSVG}>
            <Download className="h-4 w-4 mr-2" />Export SVG
          </Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        <aside className="overflow-y-auto lg:max-h-[calc(100vh-100px)] pr-2">
          <ControlsPanel config={config} setConfig={setConfig} />
        </aside>
        <section className="border rounded-lg p-4 bg-card flex items-center justify-center min-h-[400px]">
          <ParliamentGraph ref={svgRef} config={config} />
        </section>
      </main>
    </div>
  );
}
