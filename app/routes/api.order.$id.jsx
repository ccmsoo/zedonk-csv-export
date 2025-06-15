import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }) => {
  try {
    // Shopify 인증
    const { admin } = await authenticate.admin(request);
    const orderId = params.id;

    if (!orderId) {
      return json({ error: "Order ID is required" }, { status: 400 });
    }

    // GraphQL로 주문 상세 정보 가져오기
    const response = await admin.graphql(
      `#graphql
      query getOrder($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          customer {
            firstName
            lastName
            email
          }
          shippingAddress {
            address1
            address2
            city
            province
            country
            zip
          }
          lineItems(first: 100) {
            edges {
              node {
                id
                title
                quantity
                variant {
                  id
                  title
                  sku
                  barcode
                  selectedOptions {
                    name
                    value
                  }
                }
                originalUnitPriceSet {
                  shopMoney {
                    amount
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

    const responseJson = await response.json();
    
    if (responseJson.errors) {
      console.error("GraphQL errors:", responseJson.errors);
      return json({ error: "Failed to fetch order" }, { status: 500 });
    }

    const order = responseJson.data.order;
    
    if (!order) {
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

    // 각 라인 아이템을 행으로 변환
    order.lineItems.edges.forEach(({ node: item }) => {
      const customerName = order.customer 
        ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim()
        : 'Guest';
      
      // variant options에서 Size와 Colour 추출
      let size = '';
      let colour = '';
      
      if (item.variant && item.variant.selectedOptions) {
        item.variant.selectedOptions.forEach(option => {
          if (option.name.toLowerCase() === 'size') {
            size = option.value;
          } else if (option.name.toLowerCase() === 'color' || option.name.toLowerCase() === 'colour') {
            colour = option.value;
          }
        });
      }

      csvRows.push([
        order.name,                        // Order Reference (#1001)
        customerName,                      // Customer Name
        '',                               // Account Code (비워둠)
        item.title,                       // Style (상품명)
        '',                               // Fabric (비워둠)
        colour,                           // Colour
        size,                             // Size
        item.variant?.barcode || '',      // Barcode
        item.quantity.toString()          // Sales Order Quantity
      ]);
    });

    // CSV 문자열로 변환
    const csvContent = csvRows
      .map(row => row.map(cell => {
        // 셀에 쉼표, 따옴표, 줄바꿈이 있으면 따옴표로 감싸기
        const cellStr = String(cell);
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
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="zedonk_order_${order.name.replace('#', '')}.csv"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
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