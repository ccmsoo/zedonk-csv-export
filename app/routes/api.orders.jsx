import { json } from "@remix-run/node";

const PRIVATE_ACCESS_TOKEN = process.env.SHOPIFY_PRIVATE_ACCESS_TOKEN;
const SHOP_DOMAIN = "cpnmmm-wb.myshopify.com";

const DEBUG = true;

// Style 코드에서 카테고리 추출
const extractFabricFromStyle = (styleCode) => {
  if (!styleCode || styleCode.length < 2) return '';
  const upperStyle = styleCode.toUpperCase();
  
  const categoryMap = {
    'VT': 'VEST', 'AC': 'ACC', 'TS': 'T-SHIRTS', 'PT': 'PANTS',
    'SH': 'SHIRTS', 'KN': 'KNIT', 'JP': 'JUMPER', 'JK': 'JACKET',
    'CD': 'CARDIGAN', 'DN': 'DENIM', 'SK': 'SKIRT', 'DR': 'DRESS',
    'SS': 'SHOES', 'BG': 'BAG', 'TO': 'TOP', 'TL': 'LONG TEE', 'CT': 'COAT'
  };
  
  const lastTwo = upperStyle.slice(-2);
  if (categoryMap[lastTwo]) {
    return categoryMap[lastTwo];
  }
  
  return '';
};

// Barcode/SKU에서 Style 추출
const extractStyleFromBarcode = (barcode) => {
  if (!barcode) return '';
  let style = barcode.toUpperCase();
  
  if (style.endsWith('OS')) {
    style = style.substring(0, style.length - 2);
    if (style.length >= 2) style = style.substring(0, style.length - 2);
    return style;
  }
  
  const clothingSizes = ['XXXL', 'XXL', 'XL', 'L', 'M', 'S', 'XS', 'XXS'];
  for (const size of clothingSizes) {
    if (style.endsWith(size)) {
      style = style.substring(0, style.length - size.length);
      if (style.length >= 2) style = style.substring(0, style.length - 2);
      return style;
    }
  }
  
  const shoeSizes = [];
  for (let i = 220; i <= 300; i += 5) shoeSizes.push(i.toString());
  
  for (const size of shoeSizes) {
    if (style.endsWith(size)) {
      style = style.substring(0, style.length - size.length);
      if (style.length >= 2) style = style.substring(0, style.length - 2);
      return style;
    }
  }
  
  const lastChar = style.charAt(style.length - 1);
  if (/^\d$/.test(lastChar)) {
    style = style.substring(0, style.length - 1);
    if (style.length >= 2) style = style.substring(0, style.length - 2);
  }
  
  return style;
};

// 🎯 Customer Tier → Metafield Key 변환
// 예: "EUR DAP" → "wsp_eur_dap"
const tierToMetafieldKey = (tier) => {
  if (!tier) return null;
  // 소문자 변환 + 공백을 _로 + 앞에 wsp_ 붙이기
  const key = 'wsp_' + tier.toLowerCase().replace(/\s+/g, '_');
  return key;
};

// 🎯 Customer Tier에서 Currency 추출
// 예: "EUR DAP" → "EUR", "USD EXW" → "USD"
const getCurrencyFromTier = (tier) => {
  if (!tier) return 'USD';
  const upper = tier.toUpperCase();
  if (upper.includes('EUR')) return 'EUR';
  if (upper.includes('JPY')) return 'JPY';
  if (upper.includes('KRW')) return 'KRW';
  if (upper.includes('GBP')) return 'GBP';
  return 'USD';
};

// 🎯 Product Metafield에서 가격 추출
const getPriceFromMetafields = (metafields, metafieldKey) => {
  if (!metafields?.edges || !metafieldKey) return 0;
  
  for (const edge of metafields.edges) {
    const { namespace, key, value } = edge.node;
    // namespace가 'custom'이고 key가 일치하는 경우
    if (namespace === 'custom' && key === metafieldKey) {
      const price = parseFloat(value) || 0;
      if (DEBUG) console.log(`    💰 Found metafield price: ${key} = ${price}`);
      return price;
    }
  }
  
  if (DEBUG) console.log(`    ⚠️ Metafield not found: ${metafieldKey}`);
  return 0;
};

export const loader = async ({ request }) => {
  console.log("\n🔄 === NEW REQUEST STARTED ===");
  console.log(`📅 Time: ${new Date().toISOString()}`);
  
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
  
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (!PRIVATE_ACCESS_TOKEN) {
    throw new Error("SHOPIFY_PRIVATE_ACCESS_TOKEN is not set");
  }

  try {
    const url = new URL(request.url);
    const orderIds = url.searchParams.get('ids');
    
    if (!orderIds) {
      return json({ error: "Order IDs are required" }, { 
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    const orderIdArray = orderIds.split(',').filter(id => id.trim());
    console.log(`📊 Processing ${orderIdArray.length} orders`);

    const graphqlEndpoint = `https://${SHOP_DOMAIN}/admin/api/2024-01/graphql.json`;
    const allOrdersData = [];

    for (const orderId of orderIdArray) {
      const gid = `gid://shopify/Order/${orderId.trim()}`;

      // ★ 라인아이템 페이지네이션: 대형 주문(100라인 초과, 예: #1203=134라인)에서
      //   CSV가 잘리던 문제 수정. 250개씩 커서로 끝까지 수집.
      let order = null;       // 페이지 누적 결과
      let liCursor = null;    // lineItems 커서
      let pageFailed = false;

      while (true) {

      // 🎯 GraphQL에 metafields 추가
      const graphqlQuery = {
        query: `
          query getOrder($id: ID!, $cursor: String) {
            order(id: $id) {
              name
              note
              tags
              customAttributes {
                key
                value
              }
              lineItems(first: 250, after: $cursor) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                edges {
                  node {
                    title
                    quantity
                    variant {
                      sku
                      barcode
                      title
                      selectedOptions {
                        name
                        value
                      }
                      product {
                        title
                        productType
                        vendor
                        tags
                        metafields(first: 30) {
                          edges {
                            node {
                              namespace
                              key
                              value
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: {
          id: gid,
          cursor: liCursor
        }
      };

      const response = await fetch(graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': PRIVATE_ACCESS_TOKEN,
        },
        body: JSON.stringify(graphqlQuery),
      });

      const responseData = await response.json();

      if (responseData.errors) {
        console.error(`GraphQL errors for ${orderId}:`, responseData.errors);
        pageFailed = true;
        break;
      }

      // 주문 데이터 확인 (이번 페이지)
      const page = responseData?.data?.order;

      if (!page) {
        console.error(`⚠️ No order data in response for ID: ${orderId}`);
        pageFailed = true;
        break;
      }

      // 첫 페이지면 그대로, 이후 페이지면 라인아이템만 누적
      if (!order) {
        order = page;
      } else {
        order.lineItems.edges.push(...page.lineItems.edges);
      }

      const pi = page.lineItems.pageInfo;
      if (pi && pi.hasNextPage) {
        liCursor = pi.endCursor;
        console.log(`  ↻ 라인아이템 추가 페이지 요청... (누적 ${order.lineItems.edges.length}개)`);
        continue;
      }
      break;
      } // while — lineItems 페이지네이션 끝

      if (order && !pageFailed) {
        console.log(`✅ ${order.name}: 라인아이템 ${order.lineItems.edges.length}개 수집`);
        allOrdersData.push(order);
      }
    }

    if (allOrdersData.length === 0) {
      return json({ error: "No orders found" }, { 
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    // 고객 정보 추출
    const extractCustomerInfo = (orderData) => {
      let customerName = '';
      let accountCode = '';
      let customerTier = '';
      
      if (orderData.customAttributes?.length > 0) {
        orderData.customAttributes.forEach(attr => {
          if (attr.key === 'Customer Name' || attr.key === 'customer_name') {
            customerName = attr.value;
          }
          if (attr.key === 'Account Code' || attr.key === 'account_code') {
            accountCode = attr.value;
          }
          if (attr.key === 'Customer Tier' || attr.key === 'customer_tier') {
            customerTier = attr.value;
          }
        });
      }
      
      // Note에서도 Customer Tier 찾기
      if (!customerTier && orderData.note) {
        const tierMatch = orderData.note.match(/Customer Tier:\s*([^\n]+)/i);
        if (tierMatch) customerTier = tierMatch[1].trim();
      }
      
      if (customerName === 'N/A') customerName = '';
      if (accountCode === 'N/A') accountCode = '';
      
      return { customerName, accountCode, customerTier };
    };

    // CSV 생성
    console.log("\n📝 Generating CSV...");
    const csvRows = [];
    
    csvRows.push([
      "Order Reference",
      "Customer Name",
      "Account Code",
      "Style",
      "Fabric",
      "Colour",
      "Size",
      "Barcode",
      "Sales Order Quantity",
      "Currency",
      "Unit Price",
      "Amount per Unit"
    ]);

    // 각 주문 처리
    allOrdersData.forEach((orderData) => {
      const { customerName, accountCode, customerTier } = extractCustomerInfo(orderData);
      
      // 🎯 Tier에서 Metafield Key와 Currency 추출
      const metafieldKey = tierToMetafieldKey(customerTier);
      const currency = getCurrencyFromTier(customerTier);
      
      if (DEBUG) {
        console.log(`\n📦 Order: ${orderData.name}`);
        console.log(`  Customer: ${customerName}`);
        console.log(`  Tier: ${customerTier}`);
        console.log(`  Metafield Key: ${metafieldKey}`);
        console.log(`  Currency: ${currency}`);
      }
      
      orderData.lineItems.edges.forEach(({ node: item }) => {
        let size = '';
        let colour = '';
        
        if (item.variant?.selectedOptions) {
          item.variant.selectedOptions.forEach(option => {
            const optionName = option.name.toLowerCase();
            if (optionName === 'size' || optionName === '사이즈') {
              size = option.value;
            } else if (optionName === 'color' || optionName === 'colour' || optionName === '색상') {
              colour = option.value;
            }
          });
        }

        if (!size && !colour && item.variant?.title && item.variant.title !== 'Default Title') {
          const parts = item.variant.title.split(' / ');
          if (parts.length >= 1 && !size) size = parts[0].trim();
          if (parts.length >= 2 && !colour) colour = parts[1].trim();
        }

        const sku = item.variant?.sku || '';
        const barcode = item.variant?.barcode || '';
        const sourceCode = sku || barcode;
        const style = sourceCode ? extractStyleFromBarcode(sourceCode) : '';
        const fabric = style ? extractFabricFromStyle(style) : '';

        // 🎯 Product Metafield에서 가격 조회
        const unitPrice = getPriceFromMetafields(
          item.variant?.product?.metafields,
          metafieldKey
        );
        const totalPrice = unitPrice * item.quantity;

        if (DEBUG) {
          console.log(`  📄 ${item.title} (${colour}/${size}) x${item.quantity} = ${unitPrice} each, ${totalPrice} total`);
        }

        csvRows.push([
          orderData.name || '',
          customerName,
          accountCode,
          style,
          fabric,
          colour || '',
          size || '',
          '',
          item.quantity.toString(),
          currency,
          totalPrice.toString(),   // Unit Price = 라인 총액
          unitPrice.toString()     // Amount per Unit = 개당 가격
        ]);
      });
    });

    console.log(`\n📊 CSV rows: ${csvRows.length} (including header)`);

    // CSV 문자열 변환
    const csvContent = csvRows
      .map(row => row.map(cell => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
      .join('\n');

    const bom = '\ufeff';
    const finalCsv = bom + csvContent;

    const date = new Date().toISOString().split('T')[0];
    const filename = `zedonk_orders_${allOrdersData.length}_${date}.csv`;

    console.log(`✅ CSV generated: ${filename}`);

    return new Response(finalCsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
      },
    });

  } catch (error) {
    console.error("\n💥 ERROR:", error.message);
    
    return json(
      { 
        error: "Internal server error", 
        details: error.message
      },
      { 
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" }
      }
    );
  }
};
