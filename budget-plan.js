const plans = {
    'วางแผนเก็บเงิน': {
        categories: [['ค่าใช้จ่ายจำเป็น', 50], ['เงินออม', 30], ['ค่าใช้จ่ายส่วนตัว', 10], ['เงินสำรองฉุกเฉิน', 10]],
        advice: 'แยกเงินออมไว้ก่อนใช้จ่าย และจดรายจ่ายทุกวันเพื่อช่วยให้เก็บเงินได้ตามแผน'
    },
    'คำนวณงบซื้อของ': {
        categories: [['งบซื้อของ', 40], ['ค่าใช้จ่ายจำเป็น', 40], ['เงินออม', 10], ['เงินสำรองฉุกเฉิน', 10]],
        advice: 'กำหนดวงเงินซื้อของตามหมวดงบซื้อของ เปรียบเทียบราคาก่อนซื้อ และอย่านำเงินจำเป็นมาใช้เพิ่ม'
    },
    'เช็กเงินพอใช้': {
        categories: [['อาหารและของจำเป็น', 50], ['ค่าเดินทาง', 20], ['ค่าใช้จ่ายส่วนตัว', 15], ['เงินสำรอง', 15]],
        advice: 'เปรียบเทียบรายจ่ายจริงกับวงเงินแต่ละหมวด หากเกินให้ลดรายจ่ายส่วนตัวก่อน แผนนี้ยังยืนยันไม่ได้ว่าเงินพอใช้จนกว่าจะทราบรายจ่ายจริงและช่วงเวลาที่ต้องใช้เงิน'
    },
    'อื่นๆ': {
        categories: [['ค่าใช้จ่ายจำเป็น', 50], ['เงินสำหรับเป้าหมาย', 20], ['ค่าใช้จ่ายส่วนตัว', 20], ['เงินสำรอง', 10]],
        advice: 'แยกเงินสำหรับเป้าหมายไว้ต่างหาก ใช้สัดส่วนนี้เป็นแผนเริ่มต้น และปรับตามค่าใช้จ่ายจริง'
    }
};

export function createBudgetPlan(amount, goal, customGoal) {
    const value = Number(amount);
    const cents = Math.round(value * 100);
    if (!['string', 'number'].includes(typeof amount) || !Number.isFinite(value) || value <= 0
        || !Number.isSafeInteger(cents) || cents <= 0 || cents / 100 !== value) {
        throw new Error('กรุณากรอกจำนวนเงินมากกว่า 0 โดยมีทศนิยมไม่เกิน 2 ตำแหน่ง และไม่เกินขอบเขตที่ระบบรองรับ');
    }
    // Existing UI sends the emoji and label together; accept both that and the plain label.
    const inputGoal = typeof goal === 'string'
        ? goal.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '').trim() : '';
    const aliases = { saving:'วางแผนเก็บเงิน', big_purchase:'คำนวณงบซื้อของ', enough:'เช็กเงินพอใช้', other:'อื่นๆ', 'เก็บออม':'วางแผนเก็บเงิน', 'ซื้อของชิ้นใหญ่':'คำนวณงบซื้อของ', 'เช็กว่าพอใช้ไหม':'เช็กเงินพอใช้', 'อื่น ๆ':'อื่นๆ' };
    const normalizedGoal = Object.hasOwn(aliases, inputGoal) ? aliases[inputGoal] : inputGoal;
    if (!Object.hasOwn(plans, normalizedGoal)) throw new Error('กรุณาเลือกเป้าหมายทางการเงิน');
    if (normalizedGoal === 'อื่นๆ' && customGoal !== undefined && (typeof customGoal !== 'string' || customGoal.trim().length > 200)) throw new Error('กรุณากรอกเป้าหมายเพิ่มเติม ไม่เกิน 200 ตัวอักษร');
    const displayGoal = normalizedGoal === 'อื่นๆ' ? customGoal?.trim() || 'วางแผนงบประมาณทั่วไป' : ['saving','big_purchase','enough'].includes(inputGoal) ? normalizedGoal : inputGoal;
    const plan = plans[normalizedGoal];
    const totalCents = BigInt(cents);
    let remaining = totalCents;
    const categories = plan.categories.map(([name, percent], index) => {
        const allocated = index === plan.categories.length - 1 ? remaining : totalCents * BigInt(percent) / 100n;
        remaining -= allocated;
        return { name, amount: Number(allocated) / 100, percent: Number(allocated) / cents * 100 };
    });
    const money = number => number.toLocaleString('th-TH', {minimumFractionDigits:2, maximumFractionDigits:2});
    return {
        amount: value, goal: displayGoal, categories, total: value, advice: plan.advice,
        aiResult: [
            `แผนการเงิน: ${displayGoal}`,
            `จำนวนเงินทั้งหมด: ${money(value)} บาท`, '',
            ...categories.map(category => `• ${category.name}: ${money(category.amount)} บาท (${category.percent.toFixed(2)}%)`),
            '', `รวมจัดสรร: ${money(value)} บาท`,
            'คำนวณเป็นหน่วยสตางค์ ส่วนต่างจากการปัดเศษรวมไว้ในหมวดสุดท้าย',
            '', `คำแนะนำ: ${plan.advice}`
        ].join('\n')
    };
}
