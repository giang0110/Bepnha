export type CondimentSauceType =
  | "nuoc_mam_chua_ngot"
  | "nuoc_mam_gung"
  | "nuoc_mam_cot_ot"
  | "mam_tom_chanh_ot"
  | "muoi_tieu_chanh"
  | "nuoc_tuong_toi_ot"
  | "mam_me_chua_ngot"
  | "muoi_ot_do"

export interface CondimentRecipe {
  readonly id: CondimentSauceType
  readonly nameVi: string
  readonly summaryVi: string
  readonly goldenRatioVi: string
  readonly ingredientsVi: readonly string[]
  readonly instructionVi: string
}

export type SideDishType =
  | "dua_cai_chua"
  | "dua_gia_do"
  | "ca_phao_muoi"
  | "dua_leo_thai_lat"
  | "rau_song_rau_thom"
  | "kim_chi_viet"

export interface SideDishRecommendation {
  readonly id: SideDishType
  readonly nameVi: string
  readonly reasonVi: string
}

export interface MealCondimentPairingResult {
  readonly recommendedSauces: readonly CondimentRecipe[]
  readonly recommendedSideDishes: readonly SideDishRecommendation[]
  readonly pairingNoteVi: string
}

export const CONDIMENT_RECIPES: Record<CondimentSauceType, CondimentRecipe> = {
  nuoc_mam_chua_ngot: {
    id: "nuoc_mam_chua_ngot",
    nameVi: "Nước mắm tỏi ớt chua ngọt",
    summaryVi: "Hài hòa chua - cay - mặn - ngọt, tỏi ớt nổi đẹp mắt",
    goldenRatioVi: "1 mắm : 1 đường : 1 chanh : 4 nước ấm",
    ingredientsVi: [
      "2 thìa canh nước mắm ngon (40 độ đạm trở lên)",
      "2 thìa canh đường cát",
      "2 thìa canh nước cốt chanh (hoặc giấm gạo)",
      "8 thìa canh nước ấm",
      "3-4 tép tỏi băm nhuyễn",
      "1-2 quả ớt hiểm băm nhuyễn"
    ],
    instructionVi:
      "Khuấy tan đường trong nước ấm. Cho nước cốt chanh và nước mắm vào quấy đều. Cuối cùng thả tỏi và ớt băm nhuyễn lên trên để tỏi ớt nổi đều trên bề mặt."
  },
  nuoc_mam_gung: {
    id: "nuoc_mam_gung",
    nameVi: "Nước mắm gừng",
    summaryVi: "Vị cay ấm nồng của gừng tươi, đậm đà chua ngọt",
    goldenRatioVi: "2 mắm : 1 đường : 1 gừng giã : 1 chanh : 2 nước ấm",
    ingredientsVi: [
      "3 thìa canh nước mắm ngon",
      "1.5 thìa canh đường",
      "1 củ gừng tươi cạo vỏ, giã nhuyễn",
      "1 thìa canh nước cốt chanh",
      "3 thìa canh nước ấm",
      "1 quả ớt hiểm băm nhỏ"
    ],
    instructionVi:
      "Giã gừng thật nhuyễn cùng với đường để gừng ra tinh dầu thơm. Thêm nước ấm và chanh khuấy tan, sau đó rót nước mắm vào trộn đều cùng ớt băm."
  },
  nuoc_mam_cot_ot: {
    id: "nuoc_mam_cot_ot",
    nameVi: "Nước mắm cốt ớt tươi",
    summaryVi: "Nguyên bản vị mặn mòi đậm đà của mắm cá cơm nhĩ",
    goldenRatioVi: "Nước mắm nguyên chất + ớt hiểm cắt lát",
    ingredientsVi: [
      "3 thìa canh nước mắm cốt nhĩ truyền thống",
      "1-2 quả ớt chỉ thiên tươi cắt lát mỏng",
      "1 chút tiêu đen xay (tùy chọn)"
    ],
    instructionVi:
      "Rót nước mắm cốt ra bát con sạch, thả vài lát ớt tươi đỏ để dậy mùi thơm nồng đặc trưng."
  },
  mam_tom_chanh_ot: {
    id: "mam_tom_chanh_ot",
    nameVi: "Mắm tôm đánh chanh sủi bọt",
    summaryVi: "Bông xốp thơm nức, quyện vị cay ngọt chua thanh",
    goldenRatioVi: "1 mắm tôm : 1 đường : 1 chanh/quất : 1 thìa dầu sôi",
    ingredientsVi: [
      "2 thìa canh mắm tôm ngon",
      "1.5 thìa canh đường cát",
      "1 quả chanh (hoặc 2 quả quất vắt lấy nước cốt)",
      "1 thìa cà phê rượu trắng (khử tanh và bông xốp)",
      "1 thìa canh dầu ăn nóng phi hành (tùy chọn)",
      "Ớt hiểm cắt lát"
    ],
    instructionVi:
      "Cho mắm tôm, đường, rượu trắng và nước cốt chanh vào bát. Dùng đũa đánh thật nhanh tay theo một chiều cho đến khi mắm tôm sủi bọt bông dày. Thêm ớt cắt lát và dầu nóng."
  },
  muoi_tieu_chanh: {
    id: "muoi_tieu_chanh",
    nameVi: "Muối tiêu chanh lá chanh",
    summaryVi: "Vị mặn cay thơm the mát của lá chanh tươi",
    goldenRatioVi: "2 muối tiêu : 1 cốt chanh : lá chanh non thái chỉ",
    ingredientsVi: [
      "1 thìa canh muối tinh hoặc bột canh",
      "1/2 thìa cà phê tiêu đen rang mới xay",
      "1/2 quả chanh vắt lấy nước cốt",
      "2-3 lá chanh non rửa sạch thái sợi mỏng như chỉ",
      "1 lát ớt tươi băm nhỏ"
    ],
    instructionVi:
      "Cho muối, tiêu, ớt và lá chanh thái sợi chỉ vào đĩa con. Khi ăn vắt nước cốt chanh lên rồi khuấy nhẹ."
  },
  nuoc_tuong_toi_ot: {
    id: "nuoc_tuong_toi_ot",
    nameVi: "Nước tương tỏi ớt",
    summaryVi: "Thanh đạm, ngọt hậu đậu nành quyện hương tỏi thơm",
    goldenRatioVi: "3 nước tương : 1/2 đường : 1/2 chanh : tỏi ớt băm",
    ingredientsVi: [
      "3 thìa canh nước tương (xì dầu) ngon",
      "1/2 thìa cà phê đường",
      "Vài giọt nước cốt chanh",
      "Tỏi và ớt băm nhuyễn"
    ],
    instructionVi:
      "Khuấy nhẹ đường và nước cốt chanh trong nước tương cho hòa quyện, cho tỏi ớt băm lên trên bề mặt."
  },
  mam_me_chua_ngot: {
    id: "mam_me_chua_ngot",
    nameVi: "Mắm me chua ngọt",
    summaryVi: "Chua dịu vị me chín, sánh sệt cay ngọt đậm vị",
    goldenRatioVi: "2 nước cốt me : 2 đường : 1 mắm : tỏi ớt phi",
    ingredientsVi: [
      "50g me chín dầm nước ấm lấy 3 thìa nước cốt",
      "2 thìa canh đường thốt nốt hoặc đường cát",
      "1.5 thìa canh nước mắm",
      "Tỏi ớt băm nhuyễn"
    ],
    instructionVi:
      "Đun nhẹ nước cốt me với đường và nước mắm trên lửa nhỏ đến khi sánh sệt lại. Để nguội rồi trộn tỏi ớt băm."
  },
  muoi_ot_do: {
    id: "muoi_ot_do",
    nameVi: "Muối ớt đỏ / Muối ớt xanh",
    summaryVi: "Chua cay mặn ngọt sóng sánh chuyên chấm đồ nướng, hải sản",
    goldenRatioVi: "Muối + ớt + chanh + sữa đặc + đường",
    ingredientsVi: [
      "2 thìa canh đường",
      "1 thìa canh muối tinh",
      "2 thìa canh nước cốt chanh",
      "1 thìa canh sữa đặc",
      "Ớt sừng và ớt hiểm đỏ/xanh"
    ],
    instructionVi:
      "Xay nhuyễn ớt cùng đường, muối, sữa đặc và nước cốt chanh đến khi được hỗn hợp sốt sánh mịn."
  }
}

export const SIDE_DISH_CATALOG: Record<SideDishType, SideDishRecommendation> = {
  dua_cai_chua: {
    id: "dua_cai_chua",
    nameVi: "Dưa cải muối chua",
    reasonVi:
      "Giòn chua dịu, giải ngấy hoàn hảo cho các món kho đậm đà, thịt quay hoặc món chiên béo."
  },
  dua_gia_do: {
    id: "dua_gia_do",
    nameVi: "Dưa giá đỗ cà rốt",
    reasonVi:
      "Mát lành giòn sần sật, ăn kèm thịt luộc, cá chiên hoặc thịt kho làm mâm cơm thêm thanh mát."
  },
  ca_phao_muoi: {
    id: "ca_phao_muoi",
    nameVi: "Cà pháo muối giòn",
    reasonVi:
      "Món ăn kèm kinh điển đi đôi với canh cua mồng tơi, canh rau đay hoặc thịt luộc mắm tôm."
  },
  dua_leo_thai_lat: {
    id: "dua_leo_thai_lat",
    nameVi: "Dưa leo (dưa chuột) thái lát",
    reasonVi: "Tươi mát giòn ngọt, cân bằng hoàn hảo các món xào, món rán nhiều dầu mỡ."
  },
  rau_song_rau_thom: {
    id: "rau_song_rau_thom",
    nameVi: "Rau sống & rau thơm tổng hợp",
    reasonVi:
      "Kinh giới, húng quế, tía tô, xà lách chấm nước mắm chua ngọt giúp bữa cơm thanh nhẹ, dễ tiêu."
  },
  kim_chi_viet: {
    id: "kim_chi_viet",
    nameVi: "Củ cải muối chua ngọt / Kim chi",
    reasonVi: "Chua ngọt giòn tan, kích thích vị giác và chống ngán hiệu quả."
  }
}

function removeDiacritics(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

export function recommendMealCondiments(input: {
  readonly mealNameVi: string
  readonly dishNames?: readonly string[] | undefined
  readonly dishRoles?: readonly string[] | undefined
}): MealCondimentPairingResult {
  const allTexts = [input.mealNameVi, ...(input.dishNames ?? []), ...(input.dishRoles ?? [])]
  const combinedText = removeDiacritics(allTexts.join(" "))

  const sauces: CondimentSauceType[] = []
  const sideDishes: SideDishType[] = []

  const isFish =
    combinedText.includes("ca ") ||
    combinedText.includes("ca_") ||
    combinedText.includes("hai san") ||
    combinedText.includes("muc") ||
    combinedText.includes("ngheu") ||
    combinedText.includes("so")
  const isFried =
    combinedText.includes("chien") ||
    combinedText.includes("ran") ||
    combinedText.includes("chao") ||
    combinedText.includes("quay") ||
    combinedText.includes("cha ram") ||
    combinedText.includes("cha gio")
  const isBoiled = combinedText.includes("luoc") || combinedText.includes("hap")
  const isPork =
    combinedText.includes("thit heo") ||
    combinedText.includes("thit lon") ||
    combinedText.includes("ba chi") ||
    combinedText.includes("tai heo") ||
    combinedText.includes("thit luoc")
  const isChicken =
    combinedText.includes("ga") || combinedText.includes("vit") || combinedText.includes("ngan")
  const isBeef = combinedText.includes("bo") || combinedText.includes("thit bo")
  const isSourSoup =
    combinedText.includes("canh chua") ||
    combinedText.includes("nau chua") ||
    combinedText.includes("nau me")
  const isCrabSoup =
    combinedText.includes("canh cua") ||
    combinedText.includes("cua dong") ||
    combinedText.includes("rau day") ||
    combinedText.includes("mong toi")
  const isTofu = combinedText.includes("dau phu") || combinedText.includes("dau hu")
  const isBraised = combinedText.includes("kho") || combinedText.includes("rim")
  const isVegetable =
    combinedText.includes("rau") ||
    combinedText.includes("cai") ||
    combinedText.includes("muong") ||
    combinedText.includes("sup lo") ||
    combinedText.includes("bau") ||
    combinedText.includes("bi")

  // Rule 1: Fish + Fried -> Nước mắm gừng & Nước mắm tỏi ớt chua ngọt
  if (isFish && (isFried || isBoiled)) {
    sauces.push("nuoc_mam_gung", "nuoc_mam_chua_ngot")
    sideDishes.push("dua_leo_thai_lat", "rau_song_rau_thom")
  }

  // Rule 2: Chicken / Duck boiled -> Muối tiêu chanh lá chanh
  if (isChicken && isBoiled) {
    sauces.push("muoi_tieu_chanh")
    if (combinedText.includes("vit") || combinedText.includes("ngan")) {
      sauces.push("nuoc_mam_gung")
    }
  }

  // Rule 3: Boiled Pork / Tofu -> Mắm tôm đánh chanh & Nước mắm tỏi ớt chua ngọt
  if ((isPork || isTofu) && (isBoiled || isFried)) {
    if (!sauces.includes("mam_tom_chanh_ot")) sauces.push("mam_tom_chanh_ot")
    if (!sauces.includes("nuoc_mam_chua_ngot")) sauces.push("nuoc_mam_chua_ngot")
    sideDishes.push("dua_gia_do", "dua_cai_chua")
  }

  // Rule 4: Crab soup -> Cà pháo muối
  if (isCrabSoup) {
    sideDishes.push("ca_phao_muoi")
    if (!sauces.includes("mam_tom_chanh_ot")) sauces.push("mam_tom_chanh_ot")
  }

  // Rule 5: Sour soup / Braised fish / Braised meat -> Nước mắm cốt ớt tươi
  if (isSourSoup || isBraised) {
    if (!sauces.includes("nuoc_mam_cot_ot")) sauces.push("nuoc_mam_cot_ot")
    sideDishes.push("rau_song_rau_thom", "dua_cai_chua")
  }

  // Rule 6: Stir-fried beef / Boiled vegetables -> Nước tương tỏi ớt
  if ((isBeef && !isBraised) || (isVegetable && isBoiled)) {
    if (!sauces.includes("nuoc_tuong_toi_ot")) sauces.push("nuoc_tuong_toi_ot")
  }

  // General fried items -> Nước mắm chua ngọt
  if (isFried && !sauces.includes("nuoc_mam_chua_ngot")) {
    sauces.push("nuoc_mam_chua_ngot")
    sideDishes.push("dua_leo_thai_lat")
  }

  // Fallbacks: ensure at least one sauce
  if (sauces.length === 0) {
    sauces.push("nuoc_mam_chua_ngot", "nuoc_mam_cot_ot")
  }
  if (sideDishes.length === 0) {
    sideDishes.push("dua_leo_thai_lat", "rau_song_rau_thom")
  }

  // Deduplicate preserving order
  const uniqueSauces = Array.from(new Set(sauces)).map((id) => CONDIMENT_RECIPES[id])
  const uniqueSides = Array.from(new Set(sideDishes)).map((id) => SIDE_DISH_CATALOG[id])

  // Contextual advice note
  let pairingNoteVi =
    "Mâm cơm thêm tròn vị khi có bát nước chấm chuẩn vị và đĩa đồ ăn kèm thanh mát."
  if (isFish && isFried) {
    pairingNoteVi =
      "Cá chiên giòn rụm kết hợp nước mắm gừng cay ấm hoặc mắm tỏi ớt chua ngọt giúp khử tanh và tôn trọn vị ngọt thịt cá."
  } else if (isPork && isBoiled) {
    pairingNoteVi =
      "Thịt luộc chín tới chấm mắm tôm sủi bọt thơm lừng hoặc mắm tỏi ớt, ăn kèm dưa giá đỗ giòn thanh chống ngấy tuyệt hảo."
  } else if (isChicken && isBoiled) {
    pairingNoteVi =
      "Gà luộc vàng óng không thể thiếu đĩa muối tiêu chanh điểm thêm chút lá chanh non thái sợi the mát."
  } else if (isSourSoup) {
    pairingNoteVi =
      "Canh chua giải nhiệt nên đi kèm chén nước mắm cốt nhĩ mộc điểm vài lát ớt hiểm cắt mỏng để chấm cá và thịt."
  } else if (isBraised) {
    pairingNoteVi =
      "Món kho đậm vị mặn ngọt ăn cùng cơm nóng và đĩa dưa chua hoặc dưa leo giòn rụm giúp bữa ăn cân bằng, thanh vị."
  }

  return {
    recommendedSauces: uniqueSauces,
    recommendedSideDishes: uniqueSides,
    pairingNoteVi
  }
}
