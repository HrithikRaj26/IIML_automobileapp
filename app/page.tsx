import { getBoardData, dailySeriesFor } from "@/lib/data";
import ExposureBoard, { BoardRow } from "@/components/ExposureBoard";

export default function ExposureBoardPage() {
  const board = getBoardData();
  const rows: BoardRow[] = board.map((r) => ({
    ...r,
    daily: dailySeriesFor(r.asset.id),
  }));

  return <ExposureBoard rows={rows} />;
}
