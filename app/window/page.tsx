import { loadJobs, loadAssets } from "@/lib/data";
import WindowPlanner from "@/components/WindowPlanner";

export default function WindowPlannerPage() {
  const jobs = loadJobs();
  const assets = loadAssets();
  return <WindowPlanner jobs={jobs} assets={assets} />;
}
