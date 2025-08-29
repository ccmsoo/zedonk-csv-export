import { json } from "@remix-run/node";

const PRIVATE_ACCESS_TOKEN = process.env.SHOPIFY_PRIVATE_ACCESS_TOKEN;
const SHOP_DOMAIN = "cpnmmm-wb.myshopify.com";

// 디버깅 모드 활성화
const DEBUG = true;

// Style 코드에서 카테고리 추출 함수
const extractFabricFromStyle = (styleCode) => {
  if (!styleCode || styleCode.length < 2) return '';
  const upperStyle = styleCode.toUpperCase();
  
  const categoryMap = {
    'VT': 'VEST',
    'AC': 'ACC',
    'TS': 'T-SHIRTS',
    'PT': 'PANTS',
    'SH': 'SHIRTS',
    'KN': 'KNIT',
    'JP': 'JUMPER',
    'JK': 'JACKET',
    'CD': 'CARDIGAN',
    'DN': 'DENIM',
    'SK': 'SKIRT',
    'DR': 'DRESS',
    'SS': 'SHOES',
    'BG': 'BAG',
    'TO': 'TOP',
    'TL': 'LONG TEE',
    'CT': 'COAT'
  };
  
  const lastTwo = upperStyle.slice(-2);
  
  if (categoryMap[lastTwo]) {
    if (DEBUG) console.log(`Found category code ${lastTwo} in style ${styleCode}`);
    return categoryMap[lastTwo];
  }
  
  if (DEBUG) console.log(`No category code found in style: ${styleCode}`);
  return '';
};

// Style 추출 함수
const extractStyleFromBarcode = (barcode) => {
  if (!barcode) return '';
  
  let style = barcode.toUpperCase();
  
  if (style.endsWith('OS')) {
    style = style.substring(0, style.length - 2);
    if (style.length >= 2) {
      style = style.substring(0, style.length - 2);
    }
    return style;
  }
  
  const clothingSizes = ['XXXL', 'XXL', 'XL', 'L', 'M', 'S', 'XS', 'XXS'];
  
  for (const size of clothingSizes) {
    if (style.endsWith(size)) {
      style = style.substring(0, style.length - size.length);
      if (style.length >= 2) {
        style = style.substring(0, style.length - 2);
      }
      return style;
    }
  }
  
  const shoeSizes = [];
  for (let i = 220; i <= 300; i += 5) {
    shoeSizes.push(i.toString());
  }
  
  for (const size of shoeSizes) {
    if (style.endsWith(size)) {
      style = style.substring(0, style.length - size.length);
      if (style.length >= 2) {
        style = style.substring(0, style.length - 2);
      }
      return style;
    }
  }
  
  const lastChar = style.charAt(style.length - 1);
  if (/^\d$/.test(lastChar)) {
    style = style.substring(0, style.length - 1);
    if (style.length >= 2) {
      style = style.substring(0, style.length - 2);
    }
    return style;
  }
  
  return style;
};

export const loader = async ({ request }) => {
  console.log("\n🔄 === NEW REQUEST STARTED ===");
  console.log(`📅 Time: ${new Date().toISOString()}`);
  console.log(`🌐 Request URL: ${request.url}`);
  console.log(`📋 Method: ${request.method}`);
  
  // HEAD 요청 처리
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
  
  // CORS preflight 요청 처리
  if (request.method === "OPTIONS") {
    console.log("✅ Handling OPTIONS request");
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
    console.error("❌ SHOPIFY_PRIVATE_ACCESS_TOKEN is not set!");
    throw new Error("SHOPIFY_PRIVATE_ACCESS_TOKEN is not set");
  }

  // 환경 변수 검증
  if (DEBUG) {
    console.log("=== Environment Check ===");
    console.log("Token exists:", !!PRIVATE_ACCESS_TOKEN);
    console.log("Token format:", PRIVATE_ACCESS_TOKEN?.startsWith('shpat_') ? 'Valid format' : 'Invalid format');
    console.log("Token length:", PRIVATE_ACCESS_TOKEN?.length);
    console.log("Shop domain:", SHOP_DOMAIN);
  }

  try {
    const url = new URL(request.url);
    const orderIds = url.searchParams.get('ids');
    
    console.log(`📦 Order IDs received: ${orderIds}`);
    
    if (!orderIds) {
      console.error("❌ No order IDs provided in request");
      return json({ error: "Order IDs are required" }, { 
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    const orderIdArray = orderIds.split(',').filter(id => id.trim());
    console.log(`📊 Order IDs parsed: ${JSON.stringify(orderIdArray)}`);
    console.log(`📊 Total orders to process: ${orderIdArray.length}`);

    // API 엔드포인트 확인
    const graphqlEndpoint = `https://${SHOP_DOMAIN}/admin/api/2024-01/graphql.json`;
    console.log(`🔗 GraphQL Endpoint: ${graphqlEndpoint}`);
    
    const allOrdersData = [];
    let successCount = 0;
    let errorCount = 0;

    // 각 주문에 대해 GraphQL 쿼리 실행
    for (let index = 0; index < orderIdArray.length; index++) {
      const orderId = orderIdArray[index].trim();
      console.log(`\n🔍 [${index + 1}/${orderIdArray.length}] Processing order: ${orderId}`);
      
      const gid = `gid://shopify/Order/${orderId}`;
      console.log(`🆔 GraphQL ID: ${gid}`);
      
      const graphqlQuery = {
        query: `
          query getOrder($id: ID!) {
            order(id: $id) {
              name
              note
              tags
              customAttributes {
                key
                value
              }
              lineItems(first: 100) {
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
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: {
          id: gid
        }
      };

      console.log("📤 Sending GraphQL request...");
      
      const startTime = Date.now();
      const response = await fetch(graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': PRIVATE_ACCESS_TOKEN,
        },
        body: JSON.stringify(graphqlQuery),
      });
      const responseTime = Date.now() - startTime;
      
      console.log(`📡 Response received in ${responseTime}ms`);
      console.log(`📡 Status: ${response.status} ${response.statusText}`);
      
      // 응답 헤더 디버깅
      const rateLimitRemaining = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
      if (rateLimitRemaining) {
        console.log(`⚠️ API Rate Limit: ${rateLimitRemaining}`);
      }
      
      // 응답 본문 파싱
      const responseText = await response.text();
      console.log(`📄 Response size: ${responseText.length} bytes`);
      
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error("❌ JSON Parse Error:", parseError);
        console.error("Raw response (first 500 chars):", responseText.substring(0, 500));
        errorCount++;
        continue;
      }
      
      // 전체 응답 구조 확인
      console.log("Full response structure:", JSON.stringify(responseData, null, 2).substring(0, 1000));
      
      if (responseData.errors) {
        console.error(`❌ Error type: ${typeof responseData.errors}`);
        console.error(`❌ Error content:`, responseData.errors);
        
        // 에러 처리 로직
        if (Array.isArray(responseData.errors)) {
          responseData.errors.forEach((error, idx) => {
            console.error(`  Error ${idx + 1}:`, error.message || error);
            if (error.extensions) {
              console.error(`  Extensions:`, JSON.stringify(error.extensions));
            }
          });
        } else if (typeof responseData.errors === 'string') {
          console.error(`  Error: ${responseData.errors}`);
        } else {
          console.error(`  Error:`, JSON.stringify(responseData.errors));
        }
        
        errorCount++;
        continue;
      }
      
      // 주문 데이터 확인
      const order = responseData?.data?.order;
      
      if (order) {
        console.log(`✅ Order found: ${order.name}`);
        console.log(`  - Has note: ${!!order.note}`);
        console.log(`  - Line items count: ${order.lineItems.edges.length}`);
        console.log(`  - Tags: ${order.tags || 'none'}`);
        console.log(`  - Custom attributes: ${order.customAttributes?.length || 0}`);
        
        allOrdersData.push(order);
        successCount++;
      } else {
        console.error(`⚠️ No order data in response for ID: ${orderId}`);
        console.log("Response structure:", JSON.stringify(responseData, null, 2).substring(0, 500));
        errorCount++;
      }
    }

    console.log(`\n📊 === PROCESSING SUMMARY ===`);
    console.log(`✅ Successful: ${successCount}/${orderIdArray.length}`);
    console.log(`❌ Failed: ${errorCount}/${orderIdArray.length}`);
    console.log(`📦 Orders collected: ${allOrdersData.length}`);

    if (allOrdersData.length === 0) {
      console.error("❌ No orders were successfully retrieved");
      return json({ 
        error: "No orders found",
        debug: {
          requested: orderIdArray.length,
          successful: successCount,
          failed: errorCount,
          tokenValid: !!PRIVATE_ACCESS_TOKEN,
          shopDomain: SHOP_DOMAIN
        }
      }, { 
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    // 고객 정보 추출 함수 (깨진 텍스트 처리 개선)
    const extractCustomerInfo = (orderData) => {
      let customerName = '';
      let accountCode = '';
      
      if (DEBUG) {
        console.log(`\n🔍 Extracting customer info for order: ${orderData.name}`);
      }
      
      // 1. Custom Attributes에서 찾기
      if (orderData.customAttributes && orderData.customAttributes.length > 0) {
        orderData.customAttributes.forEach(attr => {
          if (DEBUG) console.log(`  Attribute: ${attr.key} = ${attr.value}`);
          if (attr.key === 'Customer Name' || attr.key === 'customer_name') {
            customerName = attr.value;
          }
          if (attr.key === 'Account Code' || attr.key === 'account_code') {
            accountCode = attr.value;
          }
        });
      }
      
      // 2. Order Note에서 파싱 (깨진 텍스트 처리)
      if (orderData.note) {
        if (DEBUG) {
          console.log(`  Note preview (first 200 chars): ${orderData.note.substring(0, 200)}`);
          // 문자 코드 확인
          const firstChars = orderData.note.substring(0, 20).split('').map(c => c.charCodeAt(0));
          console.log(`  Character codes: ${firstChars.join(', ')}`);
        }
        
        // 여러 패턴 시도
        const patterns = [
          /고객명:\s*([^\n]+)/,
          /ê³\s*ê°[^:]*:\s*([^\n]+)/,  // 깨진 텍스트
          /Customer Name:\s*([^\n]+)/i,
          /\.{3}\s*([^\n]+)$/m  // "..." 뒤의 이름
        ];
        
        if (!customerName) {
          for (const pattern of patterns) {
            const match = orderData.note.match(pattern);
            if (match) {
              customerName = match[1].trim().replace(/[â€™""]/g, '');
              if (DEBUG) console.log(`  Found name with pattern: ${customerName}`);
              break;
            }
          }
        }
        
        // Account Code 추출
        if (!accountCode) {
          const codeMatch = orderData.note.match(/Account Code:\s*(\d+)/);
          if (codeMatch) {
            accountCode = codeMatch[1].trim();
            if (DEBUG) console.log(`  Found account code: ${accountCode}`);
          }
        }
      }
      
      // N/A 값 처리
      if (customerName === 'N/A') customerName = '';
      if (accountCode === 'N/A') accountCode = '';
      
      if (DEBUG) {
        console.log(`  📌 Final - Name: "${customerName}", Code: "${accountCode}"`);
      }
      
      return { customerName, accountCode };
    };

    // CSV 생성
    console.log("\n📝 Generating CSV...");
    const csvRows = [];
    
    // Zedonk 형식 헤더
    csvRows.push([
      "Order Reference",
      "Customer Name",
      "Account Code",
      "Style",
      "Fabric",
      "Colour",
      "Size",
      "Barcode",
      "Sales Order Quantity"
    ]);

    let totalLineItems = 0;

    // 모든 주문의 라인 아이템 처리
    allOrdersData.forEach((orderData, orderIndex) => {
      const { customerName, accountCode } = extractCustomerInfo(orderData);
      
      if (DEBUG && orderIndex === 0) {
        console.log(`\n📦 Sample order processing: ${orderData.name}`);
      }
      
      orderData.lineItems.edges.forEach(({ node: item }, itemIndex) => {
        totalLineItems++;
        
        if (DEBUG && orderIndex === 0 && itemIndex === 0) {
          console.log(`  📄 Sample line item:`, {
            title: item.title,
            quantity: item.quantity,
            sku: item.variant?.sku,
            barcode: item.variant?.barcode
          });
        }
        
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

        csvRows.push([
          orderData.name || '',
          customerName,
          accountCode,
          style,
          fabric,
          colour || '',
          size || '',
          '',
          item.quantity.toString()
        ]);
      });
    });

    console.log(`\n📊 CSV Generation Summary:`);
    console.log(`  - Total rows: ${csvRows.length} (including header)`);
    console.log(`  - Total line items: ${totalLineItems}`);

    // CSV 문자열로 변환
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

    console.log(`✅ CSV generated successfully`);
    console.log(`📁 Filename: ${filename}`);
    console.log(`📏 File size: ${finalCsv.length} bytes`);
    console.log("✨ === REQUEST COMPLETED ===\n");

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
    console.error("\n💥 === FATAL ERROR ===");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    
    return json(
      { 
        error: "Internal server error", 
        details: error.message,
        debug: {
          errorType: error.constructor.name,
          tokenExists: !!PRIVATE_ACCESS_TOKEN,
          shopDomain: SHOP_DOMAIN
        }
      },
      { 
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        }
      }
    );
  }
};