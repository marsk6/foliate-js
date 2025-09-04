const layoutNodesList = [
  {
    type: 'element',
    nodeId: _nodeId1,
    children: [
      {
        type: 'element',
        nodeId: _nodeId2,
        children: [],
        position: {
          startX: startX,
          endX: X, // 返回的 x 值
          startY: startY,
          endY: Y, // 返回的 y 值
          startLine: startLine,
          endLine: line,
        },
      },
      {
        type: 'element',
        nodeId: _nodeId3,
        children: [
          {
            type: 'text',
            nodeId: _nodeId4,
            position: {
              startX: startX,
              endX: X,
              startY: startY,
              endY: Y,
              startLine: startLine,
              endLine: line,
            },
            layout: [words1, words2, words3],
          },
        ],
      },
      {
        type: 'element',
        nodeId: _nodeId5,
        children: [
          {
            type: 'image',
            nodeId: _nodeId6,
            position: {
              startX: startX,
              endX: X, // 返回的 x 值
              startY: startY,
              endY: Y,
              startLine: startLine,
              endLine: line,
            },
            layout: [image1],
          },
        ],
      },
    ],
  },
];

