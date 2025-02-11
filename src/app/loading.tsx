import { Skeleton } from "@mui/material";

export default function Loading() {
  const skeletonCount = 4; // Number of Skeleton components to render
  const skeletons = Array.from({ length: skeletonCount }, (_, index) => (
    <Skeleton
      key={index}
      sx={{ bgcolor: "grey.350" }}
      variant="rounded"
      width={"42rem"}
      height={"20rem"}
      style={{ margin: "1rem" }}
    />
  ));
  return <div style={{ marginTop: "4rem" }}>{skeletons}</div>;
}
