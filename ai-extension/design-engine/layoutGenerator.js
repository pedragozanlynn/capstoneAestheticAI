export function generateLayout(room) {
    if (!room || !room.length || !room.width) return [];
  
    // DEFAULT BED (ALWAYS VISIBLE)
    return [
      {
        id: "bed",
        x: 0.5,
        y: 0.5,
        width: 2,
        height: 1.5,
      },
      {
        id: "wardrobe",
        x: room.length - 1.2,
        y: 0.5,
        width: 1,
        height: 0.6,
      },
    ];
  }
  