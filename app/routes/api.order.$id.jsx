import { json } from "@remix-run/node";

// 환경변수에서 토큰 가져오기 (또는 하드코딩된 값 사용)
const PRIVATE_ACCESS_TOKEN = process.env.SHOPIFY_PRIVATE_ACCESS_TOKEN || "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";
const SHOP_DOMAIN = "cpnmmm-wb.myshopify.com";

export const loader = async ({ request, params }) => {
  try {
    const orderId = params.id;
    console.log("API called with order ID:", orderId);

    if (!orderId) {
      return json({ error: "Order ID is required" }, { status: 400 });
    }

    // Private App으로 GraphQL 요청
    const graphqlEndpoint = `https://${SHOP_DOMAIN}/admin/api/2024-01/graphql.json`;
    
    const graphqlQuery = {
      query: `
        query getOrder($id: ID!) {
          order(id: $id) {
            name
            email
            phone
            shippingAddress {
              firstName
              lastName
              name
              address1
              address2
              city
              zip
              country
            }
            billingAddress {
              firstName
              lastName
              name
            }
            lineItems(first: 100) {
              edges {
                node {
                  title
                  quantity
                  variant {
                    sku
                    barcode
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        id: `gid://shopify/Order/${orderId}`
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
    console.log("GraphQL response received");
    
    if (responseData.errors) {
      console.error("GraphQL errors:", responseData.errors);
      return json({ error: "GraphQL query failed", details: responseData.errors }, { status: 400 });
    }
    
    const order = responseData?.data?.order;
    
    if (!order) {
      return json({ error: "Order not found" }, { status: 404 });
    }

    // CSV 생성
    const csvRows = [];
    
    // 헤더 추가
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

    // 주문 데이터로 행 생성
    order.lineItems.edges.forEach(({ node: item }) => {
      // Customer 객체 대신 다른 정보들 사용
      let customerName = '';
      
      // 우선순위: shippingAddress > billingAddress > email
      if (order.shippingAddress?.name) {
        customerName = order.shippingAddress.name;
      } else if (order.shippingAddress?.firstName || order.shippingAddress?.lastName) {
        customerName = `${order.shippingAddress.firstName || ''} ${order.shippingAddress.lastName || ''}`.trim();
      } else if (order.billingAddress?.name) {
        customerName = order.billingAddress.name;
      } else if (order.billingAddress?.firstName || order.billingAddress?.lastName) {
        customerName = `${order.billingAddress.firstName || ''} ${order.billingAddress.lastName || ''}`.trim();
      } else if (order.email) {
        // 이메일에서 이름 추출 (@ 앞부분)
        customerName = order.email.split('@')[0];
      } else {
        customerName = 'Guest';
      }
      
      // 옵션에서 Size와 Colour 추출
      let size = '';
      let colour = '';
      
      if (item.variant?.selectedOptions) {
        item.variant.selectedOptions.forEach(option => {
          const optionName = option.name.toLowerCase();
          if (optionName === 'size') {
            size = option.value;
          } else if (optionName === 'color' || optionName === 'colour') {
            colour = option.value;
          }
        });
      }

      const style = item.variant?.sku || item.title || '';

      csvRows.push([
        order.name,
        customerName,
        '',  // Account Code - 비워둠
        style,
        '',  // Fabric - 비워둠
        colour,
        size,
        item.variant?.barcode || '',
        item.quantity.toString()
      ]);
    });

    // CSV 문자열로 변환
    const csvContent = csvRows
      .map(row => row.map(cell => {
        const cellStr = String(cell || '');
        // 쉼표, 큰따옴표, 줄바꿈이 있으면 큰따옴표로 감싸기
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
      .join('\n');

    // BOM 추가 (Excel에서 UTF-8 인식)
    const bom = '\ufeff';
    const finalCsv = bom + csvContent;

    console.log("CSV generated successfully");

    // CSV 파일로 응답
    return new Response(finalCsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="zedonk_order_${orderId}.csv"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error("API Error:", error);
    return json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
};