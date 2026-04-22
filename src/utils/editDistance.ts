// src/utils/editDistance.ts
// 编辑距离算法（Levenshtein distance）

/** 计算两个字符串的编辑距离 */
export function editDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;

  // 使用一维数组优化空间复杂度
  const dp = new Array(bLen + 1);

  // 初始化第一行
  for (let j = 0; j <= bLen; j++) {
    dp[j] = j;
  }

  for (let i = 1; i <= aLen; i++) {
    let prev = dp[0]; // 保存 dp[i-1][j-1]
    dp[0] = i;

    for (let j = 1; j <= bLen; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(
          dp[j],     // 删除（dp[i-1][j]）
          dp[j - 1], // 插入（dp[i][j-1]）
          prev,      // 替换（dp[i-1][j-1]）
        );
      }
      prev = temp;
    }
  }

  return dp[bLen];
}

/** 高亮显示差异字母位置 */
export function highlightDifferences(input: string, target: string): Array<{ char: string; isDiff: boolean }> {
  const result: Array<{ char: string; isDiff: boolean }> = [];

  // 使用动态规划找到最优对齐
  const dp: number[][] = Array.from({ length: input.length + 1 }, () =>
    Array.from({ length: target.length + 1 }, () => 0),
  );

  for (let i = 1; i <= input.length; i++) {
    dp[i][0] = i;
  }
  for (let j = 1; j <= target.length; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= input.length; i++) {
    for (let j = 1; j <= target.length; j++) {
      if (input[i - 1].toLowerCase() === target[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  // 回溯找出差异
  let i = input.length;
  let j = target.length;
  const inputDiffs = new Set<number>();
  const targetDiffs = new Set<number>();

  while (i > 0 || j > 0) {
    if (i === 0) {
      targetDiffs.add(j - 1);
      j--;
    } else if (j === 0) {
      inputDiffs.add(i - 1);
      i--;
    } else if (input[i - 1].toLowerCase() === target[j - 1].toLowerCase()) {
      i--;
      j--;
    } else {
      const delCost = dp[i - 1][j];
      const insCost = dp[i][j - 1];
      const subCost = dp[i - 1][j - 1];

      if (subCost <= delCost && subCost <= insCost) {
        inputDiffs.add(i - 1);
        targetDiffs.add(j - 1);
        i--;
        j--;
      } else if (delCost <= insCost) {
        inputDiffs.add(i - 1);
        i--;
      } else {
        targetDiffs.add(j - 1);
        j--;
      }
    }
  }

  // 为输入字符串生成高亮结果
  for (let k = 0; k < input.length; k++) {
    result.push({
      char: input[k],
      isDiff: inputDiffs.has(k),
    });
  }

  return result;
}

/** 判断是否为拼写相似（编辑距离 <= 1） */
export function isSpellingSimilar(input: string, target: string): boolean {
  const dist = editDistance(input.toLowerCase(), target.toLowerCase());
  return dist <= 1;
}
