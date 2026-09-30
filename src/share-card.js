export async function createShareCardFile(result) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b0e0a'; ctx.fillRect(0,0,1080,1080);
    const colors = ['#d7ef35','#ff805b','#ec83cc','#00c9a0'];
    for (let i=0;i<8;i++) {
      ctx.fillStyle = colors[i%4];
      ctx.fillRect(72+i*120,72,96,16);
    }
    ctx.fillStyle = '#f0f0e8'; ctx.font = 'bold 58px sans-serif';
    ctx.fillText('COLOR BOMB',72,190);
    ctx.fillStyle = '#b8bdb4'; ctx.font = '28px sans-serif';
    ctx.fillText(result.kind === 'practice' ? 'PRACTICE RESULT' : 'RANKING CHALLENGE',72,255);
    ctx.fillStyle = '#d7ef35'; ctx.font = 'bold 142px sans-serif';
    ctx.fillText(result.score.toLocaleString('en-US'),65,475,940);
    ctx.fillStyle = '#f0f0e8'; ctx.font = 'bold 40px sans-serif';
    ctx.fillText(`LV ${result.level}${result.rank ? `  /  시즌 ${result.rank}위` : ''}`,72,560);
    ctx.font = 'bold 46px sans-serif'; ctx.fillText('이 기록, 넘을 수 있나요?',72,790);
    ctx.fillStyle = '#b8bdb4'; ctx.font = '30px sans-serif';
    ctx.fillText('같은 색 6칸부터 시작되는 연쇄',72,850);
    ctx.fillStyle = '#ff805b'; ctx.font = 'bold 30px sans-serif';
    ctx.fillText('COLOR BOMB · 지금 도전하기 ↗',72,980);
    const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
    return blob ? new File([blob],'color-bomb-score.png',{type:'image/png'}) : null;
  } catch { return null; }
}
