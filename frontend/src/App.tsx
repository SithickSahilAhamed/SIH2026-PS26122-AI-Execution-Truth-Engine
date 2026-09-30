import { useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { CommandCenter } from "./pages/CommandCenter";
import { DataIngestion } from "./pages/DataIngestion";
import { EventVerification } from "./pages/EventVerification";
import { AuditTrail } from "./pages/AuditTrail";
import { Conflicts } from "./pages/Conflicts";
import { DependencyImpact } from "./pages/DependencyImpact";
import { ExecutionTwin } from "./pages/ExecutionTwin";
import { FieldReports } from "./pages/FieldReports";
import { HeroDemo } from "./pages/HeroDemo";
import { InstitutionalMemory } from "./pages/InstitutionalMemory";
import { ReviewQueue } from "./pages/ReviewQueue";
import { ScheduleGantt } from "./pages/ScheduleGantt";
import { WhatIfSimulator } from "./pages/WhatIfSimulator";
import { EvidenceCenter } from "./pages/EvidenceCenter";

export default function App() {
  const [heroOpen, setHeroOpen] = useState(false);

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout onRunDemo={() => setHeroOpen(true)} />}>
          <Route path="/" element={<CommandCenter />} />
          <Route path="/ingestion" element={<DataIngestion />} />
          <Route path="/reports" element={<FieldReports />} />
          <Route path="/extraction" element={<EventVerification />} />
          <Route path="/review" element={<ReviewQueue />} />
          <Route path="/evidence" element={<EvidenceCenter />} />
          <Route path="/conflicts" element={<Conflicts />} />
          <Route path="/twin" element={<ExecutionTwin />} />
          <Route path="/schedule" element={<ScheduleGantt />} />
          <Route path="/impact" element={<DependencyImpact />} />
          <Route path="/what-if" element={<WhatIfSimulator />} />
          <Route path="/memory" element={<InstitutionalMemory />} />
          <Route path="/audit" element={<AuditTrail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <HeroDemo open={heroOpen} onClose={() => setHeroOpen(false)} />
    </HashRouter>
  );
}
