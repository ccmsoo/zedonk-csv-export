import { json } from "@remix-run/node";

const PRIVATE_ACCESS_TOKEN = process.env.SHOPIFY_PRIVATE_ACCESS_TOKEN;
const SHOP_DOMAIN = "cpnmmm-wb.myshopify.com";

if (!PRIVATE_ACCESS_TOKEN) {
  throw new Error("SHOPIFY_PRIVATE_ACCESS_TOKEN is not set");
}

export const loader = async ({ request }) => {
  // CORS preflight 요청 처리
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    // URL 파라미터에서 order IDs 가져오기
    const url = new URL(request.url);
    const orderIds = url.searchParams.get('ids');
    
    if (!orderIds) {
      return json({ error: "Order IDs are required" }, { 
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    const orderIdArray = orderIds.split(',').filter(id => id.trim());
    console.log("Processing orders:", orderIdArray);

    const graphqlEndpoint = `https://${SHOP_DOMAIN}/admin/api/2024-01/graphql.json`;
    
    // 모든 주문 데이터를 저장할 배열
    const allOrdersData = [];

    // 각 주문에 대해 GraphQL 쿼리 실행
    for (const orderId of orderIdArray) {
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
          id: `gid://shopify/Order/${orderId.trim()}`
        }
      };

      console.log(`Fetching order ${orderId}...`);
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
        console.error(`GraphQL errors for order ${orderId}:`, responseData.errors);
        continue; // 에러가 있는 주문은 건너뛰고 계속 진행
      }
      
      const order = responseData?.data?.order;
      
      if (order) {
        allOrdersData.push(order);
      }
    }

    if (allOrdersData.length === 0) {
      return json({ error: "No orders found" }, { 
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    // 고객 정보 추출 함수
    const extractCustomerInfo = (order) => {
      let customerName = '';
      let accountCode = '';
      
      // 1. Custom Attributes에서 찾기
      if (order.customAttributes && order.customAttributes.length > 0) {
        order.customAttributes.forEach(attr => {
          if (attr.key === 'Customer Name' || attr.key === 'customer_name') {
            customerName = attr.value;
          }
          if (attr.key === 'Account Code' || attr.key === 'account_code') {
            accountCode = attr.value;
          }
        });
      }
      
      // 2. Order Note에서 파싱
      if (order.note) {
        // 고객명 추출: "고객명: XXX" 패턴
        if (!customerName) {
          const nameMatch = order.note.match(/고객명:\s*([^\n]+)/);
          if (nameMatch) {
            customerName = nameMatch[1].trim();
          }
        }
        
        // Account Code 추출: "Account Code: XXX" 패턴
        if (!accountCode) {
          const codeMatch = order.note.match(/Account Code:\s*([^\n]+)/);
          if (codeMatch) {
            accountCode = codeMatch[1].trim();
          }
        }
        
        // 대체 패턴들 시도
        if (!customerName) {
          const altNameMatch = order.note.match(/Customer:\s*([^\n]+)/i);
          if (altNameMatch) {
            customerName = altNameMatch[1].trim();
          }
        }
      }
      
      // 3. Tags에서 찾기
      if (!customerName && order.tags) {
        const tags = order.tags.split(',').map(tag => tag.trim());
        const customerTag = tags.find(tag => tag.toLowerCase().startsWith('customer:'));
        if (customerTag) {
          customerName = customerTag.substring(9).replace(/_/g, ' ').trim();
        }
      }
      
      // N/A 값 처리
      if (customerName === 'N/A') customerName = '';
      if (accountCode === 'N/A') accountCode = '';
      
      return { customerName, accountCode };
    };

    // Fabric 카테고리 추출 함수
    const extractFabricFromTitleAndTags = (item) => {
      // 1. 먼저 product tags에서 확인 (SHOES, BAG은 태그 우선)
      if (item.variant?.product?.tags) {
        const productTags = item.variant.product.tags.map(tag => tag.toLowerCase());
        
        // shoes 태그 확인
        if (productTags.includes('shoes')) {
          return 'SHOES';
        }
        
        // bag 태그 확인
        if (productTags.includes('bag')) {
          return 'BAG';
        }
      }
      
      // 2. 태그에 없으면 상품명에서 추출
      const title = item.title || item.variant?.product?.title || '';
      if (!title) return '';
      
      const upperTitle = title.toUpperCase();
      
      // 카테고리 매칭 규칙 (순서 중요!)
      const categoryRules = [
        // 구체적인 카테고리부터 먼저 체크
        { keyword: 'LONG TEE', category: 'LONG TEE' },
        { keyword: 'CARDIGAN', category: 'CARDIGAN' },
        { keyword: 'JUMPER', category: 'JUMPER' },
        { keyword: 'JACKET', category: 'JACKET' },
        { keyword: 'DENIM', category: 'DENIM' },
        { keyword: 'COAT', category: 'COAT' },
        { keyword: 'DRESS', category: 'DRESS' },
        { keyword: 'VEST', category: 'VEST' },
        { keyword: 'SKIRT', category: 'SKIRT' },
        { keyword: 'PANTS', category: 'PANTS' },
        { keyword: 'SHIRT', category: 'SHIRTS' },
        { keyword: 'KNIT', category: 'KNIT' },
        { keyword: 'TOP', category: 'TOP' },
        
        // Outwear/Bottom 카테고리 매핑
        { keyword: 'OUTWEAR', category: 'COAT' },
        { keyword: 'OUTERWEAR', category: 'COAT' },
        { keyword: 'BOTTOM', category: 'PANTS' },
        { keyword: 'TROUSER', category: 'PANTS' },
        
        // ACC는 가장 마지막에
        { keyword: 'HAT', category: 'ACC' },
        { keyword: 'CAP', category: 'ACC' },
        { keyword: 'BELT', category: 'ACC' },
        { keyword: 'SCARF', category: 'ACC' },
        { keyword: 'TIE', category: 'ACC' },
        { keyword: 'SOCKS', category: 'ACC' },
        { keyword: 'GLOVE', category: 'ACC' },
        { keyword: 'WALLET', category: 'ACC' },
        { keyword: 'ACCESSORY', category: 'ACC' },
        { keyword: 'ACC', category: 'ACC' }
      ];
      
      // 규칙에 따라 매칭
      for (const rule of categoryRules) {
        if (upperTitle.includes(rule.keyword)) {
          return rule.category;
        }
      }
      
      return ''; // 매칭 안되면 빈값
    };

    // CSV 생성
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

    // 모든 주문의 라인 아이템 처리
    allOrdersData.forEach(order => {
      const { customerName, accountCode } = extractCustomerInfo(order);
      
      order.lineItems.edges.forEach(({ node: item }) => {
        let size = '';
        let colour = '';
        
        // 옵션에서 Size와 Colour 추출
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

        // variant title에서 추가 정보 추출
        if (!size && !colour && item.variant?.title && item.variant.title !== 'Default Title') {
          const parts = item.variant.title.split(' / ');
          if (parts.length >= 1 && !size) size = parts[0].trim();
          if (parts.length >= 2 && !colour) colour = parts[1].trim();
        }

        const style = item.variant?.sku || item.title || '';
        
        // Fabric 추출 - 새로운 함수 사용
        const fabric = extractFabricFromTitleAndTags(item) || 
                      item.variant?.product?.productType || 
                      '';

        console.log(`Fabric extraction - Title: ${item.title}, Product Tags: ${item.variant?.product?.tags}, Fabric: ${fabric}`);

        csvRows.push([
          order.name || '',
          customerName,
          accountCode,
          style,
          fabric,
          colour || '',
          size || '',
          item.variant?.barcode || '',
          item.quantity.toString()
        ]);
      });
    });

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

    console.log(`CSV generated successfully for ${allOrdersData.length} orders`);

    // 파일명에 주문 개수와 날짜 포함
    const date = new Date().toISOString().split('T')[0];
    const filename = `zedonk_orders_${allOrdersData.length}_${date}.csv`;

    return new Response(finalCsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
      },
    });

  } catch (error) {
    console.error("API Error:", error);
    console.error("Error stack:", error.stack);
    return json(
      { error: "Internal server error", details: error.message },
      { 
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        }
      }
    );
  }
};