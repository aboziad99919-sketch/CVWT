import React, { useState } from "react";
import { FileText, Download, Check, Sparkles, Eye, Shield, Layers, Wrench } from "lucide-react";

interface BlueprintModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BlueprintModal: React.FC<BlueprintModalProps> = ({ isOpen, onClose }) => {
  const [activeDwg, setActiveDwg] = useState<"cvwt" | "timing_belt">("cvwt");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100 font-mono">
                  Engineering Blueprint Specifications
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ESC/QU Engineering Drawings
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Official CAD blueprints & dimensional criteria for CVWT and Timing Belt Test Rig
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-sm font-semibold p-1"
          >
            ✕
          </button>
        </div>

        {/* Blueprint Switcher */}
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveDwg("cvwt")}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeDwg === "cvwt"
                ? "bg-emerald-500 text-slate-950 shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>DWG 1: CVWT Design (Ahmed Abouelezz 9/17/2026)</span>
          </button>
          <button
            onClick={() => setActiveDwg("timing_belt")}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeDwg === "timing_belt"
                ? "bg-emerald-500 text-slate-950 shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>DWG 2: Timing Belt Rig (loai Abouelezz 9/22/2026)</span>
          </button>
        </div>

        {/* DWG 1: CVWT Design */}
        {activeDwg === "cvwt" && (
          <div className="space-y-4">
            {/* Title Block Graphic Card */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div>
                <div className="text-slate-500 text-[10px]">TITLE:</div>
                <div className="text-slate-100 font-bold">CVWT design</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px]">CREATED BY:</div>
                <div className="text-slate-100 font-bold">Ahmed Abouelezz</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px]">ISSUE DATE:</div>
                <div className="text-emerald-400 font-bold">9/17/2026</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px]">DEPT / UNITS:</div>
                <div className="text-slate-100 font-bold">ESC/QU | Units in Cm</div>
              </div>
            </div>

            {/* Dimensional Specifications Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">Component</th>
                    <th className="p-3">CAD Dimension</th>
                    <th className="p-3">Function / Engineering Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  <tr>
                    <td className="p-3 font-semibold text-slate-200">Total Height</td>
                    <td className="p-3 text-emerald-400">184 cm</td>
                    <td className="p-3 text-slate-400 font-sans">
                      Optimized for highway median barrier clearance without obstructing driver line-of-sight.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-slate-200">Rotor Diameter</td>
                    <td className="p-3 text-emerald-400">66 cm</td>
                    <td className="p-3 text-slate-400 font-sans">
                      Swept cross-section tuned to two-way passing vehicle slipstream boundary layer width.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-slate-200">Base Flange</td>
                    <td className="p-3 text-emerald-400">Ø 90 cm</td>
                    <td className="p-3 text-slate-400 font-sans">
                      Reinforced structural anchor footing mounted securely into highway median barrier.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-slate-200">Blade Intake Holes</td>
                    <td className="p-3 text-sky-400">Ø 8 mm array</td>
                    <td className="p-3 text-slate-400 font-sans">
                      Aerodynamic leading edge perforations that draw in vehicle soot & particulates via centrifugal pressure drop.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-slate-200">Hollow Cylinder</td>
                    <td className="p-3 text-sky-400">Central Core Plenum</td>
                    <td className="p-3 text-slate-400 font-sans">
                      Suction plenum housing the multilayer filter while allowing vortex flow circulation.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-slate-200">Multilayer Filter</td>
                    <td className="p-3 text-purple-400">4-Stage Core</td>
                    <td className="p-3 text-slate-400 font-sans">
                      Pre-filter mesh + True HEPA H13 + Activated Carbon + Electrostatic PM precipitator.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DWG 2: Timing Belt Rig */}
        {activeDwg === "timing_belt" && (
          <div className="space-y-4">
            {/* Title Block Graphic Card */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div>
                <div className="text-slate-500 text-[10px]">TITLE:</div>
                <div className="text-slate-100 font-bold">Timing belt</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px]">CREATED BY:</div>
                <div className="text-slate-100 font-bold">loai Abouelezz</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px]">ISSUE DATE:</div>
                <div className="text-emerald-400 font-bold">9/22/2026</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px]">DWG NO / UNITS:</div>
                <div className="text-slate-100 font-bold">1/1 | Units in Cm</div>
              </div>
            </div>

            {/* Dimensional Specifications Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">Specification</th>
                    <th className="p-3">CAD Dimension</th>
                    <th className="p-3">Role in Experimental Simulation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  <tr>
                    <td className="p-3 font-semibold text-slate-200">Channel Length</td>
                    <td className="p-3 text-emerald-400">2520 cm (25.2 m)</td>
                    <td className="p-3 text-slate-400 font-sans">
                      Continuous wind tunnel section allowing boundary layer velocity to stabilize.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-slate-200">Apparatus Width</td>
                    <td className="p-3 text-emerald-400">740 cm (7.4 m)</td>
                    <td className="p-3 text-slate-400 font-sans">
                      Accommodates two opposing vehicular lanes plus central median partition.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-slate-200">Structure Height</td>
                    <td className="p-3 text-emerald-400">925 cm / 830 cm</td>
                    <td className="p-3 text-slate-400 font-sans">
                      Vertical clearance to prevent ceiling wall boundary interference.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-slate-200">Track Spacing</td>
                    <td className="p-3 text-sky-400">320 cm / 110 cm</td>
                    <td className="p-3 text-slate-400 font-sans">
                      Distance between opposing timing belts simulating standard highway lane separation.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-slate-200">Sprocket Pulleys</td>
                    <td className="p-3 text-sky-400">100 - 130 mm pitch</td>
                    <td className="p-3 text-slate-400 font-sans">
                      Precision drive sprockets for synchronized opposing belt speeds up to 120 km/h scale velocity.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold transition-colors"
          >
            Close Blueprint Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
