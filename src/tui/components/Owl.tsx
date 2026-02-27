import React from "react";
import { Text, Box } from "ink";

// Each value maps to a color. Two rows of pixels = one terminal row using half-blocks.
// 0 = transparent, 1 = body, 2 = eye, 3 = beak, 4 = belly, 5 = speckle, 6 = wing, 7 = feet
const PIXELS = [
  [0,0,0,1,0,0,0,0,0,0,1,0,0,0],  // row 0  - ear tufts
  [0,0,1,1,1,1,1,1,1,1,1,1,0,0],  // row 1  - head top
  [0,1,1,1,1,1,1,1,1,1,1,1,1,0],  // row 2
  [0,1,1,2,2,1,1,1,1,2,2,1,1,0],  // row 3  - eyes top
  [0,1,1,2,2,1,3,3,1,2,2,1,1,0],  // row 4  - eyes + beak
  [0,1,1,1,1,1,3,3,1,1,1,1,1,0],  // row 5  - beak bottom
  [0,6,1,4,4,4,4,4,4,4,4,1,6,0],  // row 6  - body + wings
  [0,6,1,4,4,4,4,4,4,4,4,1,6,0],  // row 7
  [0,0,1,4,4,5,4,4,5,4,4,1,0,0],  // row 8  - speckles
  [0,0,1,4,5,4,5,5,4,5,4,1,0,0],  // row 9
  [0,0,0,1,4,4,5,4,4,4,1,0,0,0],  // row 10
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0],  // row 11 - bottom
  [0,0,0,0,7,7,0,0,7,7,0,0,0,0],  // row 12 - feet
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],  // row 13 - padding
];

const COLORS: Record<number, string> = {
  0: "",        // transparent
  1: "#C49A2A", // body brown/gold
  2: "#2C1810", // eyes dark
  3: "#D4852A", // beak orange
  4: "#DEBB5C", // belly light
  5: "#C49A2A", // speckles
  6: "#A07818", // wings darker
  7: "#D4852A", // feet orange
};

// Renders two pixel rows per terminal line using half-block chars
function OwlPixelArt() {
  const lines: React.ReactNode[] = [];

  for (let y = 0; y < PIXELS.length; y += 2) {
    const topRow = PIXELS[y]!;
    const botRow = PIXELS[y + 1] ?? new Array(topRow.length).fill(0);
    const chars: React.ReactNode[] = [];

    for (let x = 0; x < topRow.length; x++) {
      const top = topRow[x]!;
      const bot = botRow[x]!;

      if (top === 0 && bot === 0) {
        chars.push(<Text key={x}> </Text>);
      } else if (top !== 0 && bot !== 0) {
        // Both filled: top color as fg via ▀, bottom color as bg
        chars.push(
          <Text key={x} color={COLORS[top]} backgroundColor={COLORS[bot]}>
            ▀
          </Text>
        );
      } else if (top !== 0) {
        chars.push(
          <Text key={x} color={COLORS[top]}>
            ▀
          </Text>
        );
      } else {
        chars.push(
          <Text key={x} color={COLORS[bot]}>
            ▄
          </Text>
        );
      }
    }

    lines.push(
      <Box key={y}>
        {chars}
      </Box>
    );
  }

  return <Box flexDirection="column">{lines}</Box>;
}

export { OwlPixelArt, PIXELS, COLORS };
