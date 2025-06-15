import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }) => {
  try {
    const orderId = params.id;

    if (!orderId) {
      return json({ error: "Order ID is required" }, { status: 400 });
    }

    // Shopify 인증 및 GraphQL 클라이언트 가져오기
    const { admin, session } = await authenticate.admin(request);

    // GraphQL 쿼리로 주문 데이터 가져오기
    const response = await admin.graphql(
      `#graphql
      query getOrder($id: ID!) {
        order(id: $id) {
          name
          email
          customer {
            firstName
            lastName
            email
          }
          lineItems(first: 100) {
            edges {
              node {
                title
                quantity
                variant {
                  sku
                  barcode
                  product {
                    title
                  }
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
      }`,
      {
        variables: {
          id: `gid://shopify/Order/${orderId}`,
        },
      }
    );

    // response.json()이 아니라 response 자체가 이미 JSON일 수 있음
    let responseData;
    
    // Response 객체인지 확인
    if (response && typeof response.json === 'function') {
      responseData = await response.json();
    } else {
      // 이미 파싱된 데이터인 경우
      responseData = response;
    }
    
    // 데이터 구조 확인
    const order = responseData?.data?.order || responseData?.order;
    
    if (!order) {
      console.error("Order not found in response:", responseData);
      return json({ error: "Order not found" }, { status: 404 });
    }

    // Zedonk CSV 형식으로 데이터 변환
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
      const customerName = order.customer 
        ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim()
        : 'Guest';
      
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

      // Style은 제품명 또는 variant의 SKU 사용
      const style = item.variant?.sku || item.title || '';

      csvRows.push([
        order.name,
        customerName,
        '',  // Account Code
        style,
        '',  // Fabric
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
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
      .join('\n');

    // CSV 파일로 응답
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="zedonk_order_${orderId}.csv"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error("API Error:", error);
    console.error("Error type:", typeof error);
    console.error("Error details:", error.message || error);
    
    return json(
      { error: "Internal server error", details: error.message || String(error) },
      { status: 500 }
    );
  }
};