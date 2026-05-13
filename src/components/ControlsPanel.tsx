import type { LayoutKind, Party, ParliamentConfig, Section, WestminsterSide } from "@/lib/parliament/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Trash2, Plus } from "lucide-react";

interface Props {
  config: ParliamentConfig;
  setConfig: (c: ParliamentConfig) => void;
}

const uid = () => Math.random().toString(36).slice(2, 9);

export function ControlsPanel({ config, setConfig }: Props) {
  const update = (patch: Partial<ParliamentConfig>) => setConfig({ ...config, ...patch });

  const addParty = () => {
    const colors = ["#e63946", "#1d3557", "#457b9d", "#2a9d8f", "#f4a261", "#9d4edd", "#8d99ae"];
    const c = colors[config.parties.length % colors.length];
    const p: Party = {
      id: uid(),
      name: `Party ${config.parties.length + 1}`,
      seats: 10,
      fill: c,
      stroke: "#000000",
      strokeWidth: 0.1,
      side: config.layout === "westminster" ? "government" : undefined,
    };
    update({ parties: [...config.parties, p] });
  };

  const updateParty = (id: string, patch: Partial<Party>) =>
    update({ parties: config.parties.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  const removeParty = (id: string) =>
    update({
      parties: config.parties.filter((p) => p.id !== id),
      sections: config.sections.map((s) => ({ ...s, partyIds: s.partyIds.filter((x) => x !== id) })),
    });

  const addSection = (side?: WestminsterSide) => {
    const sec: Section = { id: uid(), name: side ? `${side} group` : "Section", partyIds: [], side };
    update({ sections: [...config.sections, sec] });
  };

  const updateSection = (id: string, patch: Partial<Section>) =>
    update({ sections: config.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const removeSection = (id: string) =>
    update({ sections: config.sections.filter((s) => s.id !== id) });

  const togglePartyInSection = (secId: string, partyId: string) => {
    const sec = config.sections.find((s) => s.id === secId);
    if (!sec) return;
    const has = sec.partyIds.includes(partyId);
    updateSection(secId, {
      partyIds: has ? sec.partyIds.filter((x) => x !== partyId) : [...sec.partyIds, partyId],
    });
  };

  const onLayoutChange = (l: LayoutKind) => {
    // strip side info & sections that no longer make sense
    if (l === "westminster") {
      const parties = config.parties.map((p) => ({ ...p, side: p.side ?? "government" as WestminsterSide }));
      // drop non-westminster sections
      const sections = config.sections.filter((s) => s.side);
      setConfig({ ...config, layout: l, parties, sections });
    } else {
      const parties = config.parties.map((p) => ({ ...p, side: undefined }));
      const sections = config.sections.filter((s) => !s.side);
      setConfig({ ...config, layout: l, parties, sections });
    }
  };

  const sides: WestminsterSide[] = ["opposition", "crossbench", "government"];

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <Label>Title</Label>
          <Input value={config.title} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <div>
          <Label>Layout</Label>
          <Select value={config.layout} onValueChange={(v) => onLayoutChange(v as LayoutKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="westminster">Westminster</SelectItem>
              <SelectItem value="hemicycle">Hemicycle</SelectItem>
              <SelectItem value="horseshoe">Horseshoe</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Parties</h3>
          <Button size="sm" onClick={addParty}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
        <div className="space-y-2">
          {config.parties.map((p) => (
            <div key={p.id} className="border rounded-md p-2 space-y-2">
              <div className="flex gap-2 items-center">
                <Input
                  value={p.name}
                  onChange={(e) => updateParty(p.id, { name: e.target.value })}
                  className="flex-1"
                  placeholder="Name"
                />
                <Button size="icon" variant="ghost" onClick={() => removeParty(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Seats</Label>
                  <Input
                    type="number"
                    min={0}
                    value={p.seats}
                    onChange={(e) => updateParty(p.id, { seats: Math.max(0, +e.target.value || 0) })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Stroke width</Label>
                  <Input
                    type="number"
                    step={0.05}
                    min={0}
                    value={p.strokeWidth}
                    onChange={(e) => updateParty(p.id, { strokeWidth: Math.max(0, +e.target.value || 0) })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Fill</Label>
                  <Input type="color" value={p.fill} onChange={(e) => updateParty(p.id, { fill: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Outline</Label>
                  <Input type="color" value={p.stroke} onChange={(e) => updateParty(p.id, { stroke: e.target.value })} />
                </div>
              </div>
              {config.layout === "westminster" && (
                <div>
                  <Label className="text-xs">Side</Label>
                  <Select
                    value={p.side ?? "government"}
                    onValueChange={(v) => updateParty(p.id, { side: v as WestminsterSide })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="opposition">Opposition</SelectItem>
                      <SelectItem value="crossbench">Crossbench</SelectItem>
                      <SelectItem value="government">Government</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ))}
          {config.parties.length === 0 && <p className="text-sm text-muted-foreground">No parties yet.</p>}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Sections</h3>
        {config.layout === "westminster" ? (
          sides.map((side) => {
            const secs = config.sections.filter((s) => s.side === side);
            const partiesOnSide = config.parties.filter((p) => p.side === side);
            return (
              <div key={side} className="space-y-2 border-t pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium capitalize">{side}</h4>
                  <Button size="sm" variant="outline" onClick={() => addSection(side)}>
                    <Plus className="h-3 w-3 mr-1" />Section
                  </Button>
                </div>
                {secs.map((sec) => (
                  <SectionEditor
                    key={sec.id}
                    section={sec}
                    parties={partiesOnSide}
                    onChange={(p) => updateSection(sec.id, p)}
                    onRemove={() => removeSection(sec.id)}
                    onToggleParty={(pid) => togglePartyInSection(sec.id, pid)}
                  />
                ))}
              </div>
            );
          })
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => addSection()}>
              <Plus className="h-3 w-3 mr-1" />Add section
            </Button>
            {config.sections.map((sec) => (
              <SectionEditor
                key={sec.id}
                section={sec}
                parties={config.parties}
                onChange={(p) => updateSection(sec.id, p)}
                onRemove={() => removeSection(sec.id)}
                onToggleParty={(pid) => togglePartyInSection(sec.id, pid)}
              />
            ))}
          </>
        )}
      </Card>
    </div>
  );
}

function SectionEditor({
  section,
  parties,
  onChange,
  onRemove,
  onToggleParty,
}: {
  section: Section;
  parties: Party[];
  onChange: (p: Partial<Section>) => void;
  onRemove: () => void;
  onToggleParty: (pid: string) => void;
}) {
  return (
    <div className="border rounded-md p-2 space-y-2">
      <div className="flex gap-2 items-center">
        <Input value={section.name} onChange={(e) => onChange({ name: e.target.value })} className="flex-1" />
        <Button size="icon" variant="ghost" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {parties.map((p) => {
          const on = section.partyIds.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggleParty(p.id)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
              }`}
            >
              {p.name}
            </button>
          );
        })}
        {parties.length === 0 && <span className="text-xs text-muted-foreground">No parties available.</span>}
      </div>
    </div>
  );
}
